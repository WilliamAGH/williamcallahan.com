/**
 * Stream utilities for asset processing
 * @module lib/utils/stream-utils
 */

import logger from "./logger";

const ASSET_STREAM_TIMEOUT_MS = 20_000; // 20 seconds
// Short enough that a stalled first read still leaves the retry room inside the caller's deadline
const FIRST_BYTE_TIMEOUT_MS = 10_000;
const MAX_ASSET_SIZE_BYTES = 50 * 1024 * 1024; // 50MB limit

/**
 * Wraps a promise with a timeout
 */
export async function readWithTimeout<T>(
  promise: Promise<T>,
  assetId: string,
  {
    signal,
    timeoutMs = ASSET_STREAM_TIMEOUT_MS,
  }: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer: { id?: ReturnType<typeof setTimeout> } = {};
    const onAbort = () => {
      clearTimeout(timer.id);
      reject(new DOMException("The operation was aborted", "AbortError"));
    };
    const cleanup = () => {
      clearTimeout(timer.id);
      signal?.removeEventListener("abort", onAbort);
    };
    timer.id = setTimeout(() => {
      cleanup();
      reject(new Error(`Read timeout exceeded for asset ${assetId}`));
    }, timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
    }

    promise
      .then((result) => {
        cleanup();
        resolve(result);
        return null;
      })
      .catch((error) => {
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      });
  });
}

/**
 * Creates a stream that monitors throughput and size limits
 */
export function createMonitoredStream(
  source: ReadableStream<Uint8Array>,
  assetId: string,
  onViolation?: (error: Error) => void,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let processedBytes = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await readWithTimeout(reader.read(), assetId);

        if (done) {
          controller.close();
          return;
        }

        if (value) {
          processedBytes += value.byteLength;
          if (processedBytes > MAX_ASSET_SIZE_BYTES) {
            throw new Error(
              `Image too large: ${processedBytes} bytes exceeds ${MAX_ASSET_SIZE_BYTES} byte limit for asset ${assetId}`,
            );
          }

          controller.enqueue(value);
        }
      } catch (error) {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        onViolation?.(normalizedError);
        controller.error(normalizedError);
        // A tee branch's cancellation waits for its sibling, not for error delivery.
        void reader.cancel(normalizedError).catch((cancelErr: unknown) => {
          // Cancel can fail if stream already closed - log for debugging
          logger.debug(`[stream-utils] Cancel failed:`, cancelErr);
        });
      }
    },
    cancel(reason) {
      reader.cancel(reason).catch((err) => {
        logger.debug("[stream-utils] Cancel in cleanup failed:", err);
      });
    },
  });
}

/**
 * Opens an upstream response body only after its first byte arrives.
 * A stall before the first byte would otherwise truncate an admitted
 * response, so the upstream request is retried once through `refetch`
 * when one first-byte wait still fits before `deadlineAt` (epoch ms);
 * a stall after the first byte is left for stream consumers to surface.
 */
export async function streamBodyAfterFirstByte(
  response: Response,
  {
    refetch,
    assetId,
    deadlineAt,
    log,
    signal,
  }: {
    refetch: () => Promise<Response>;
    assetId: string;
    deadlineAt: number;
    log: (message: string) => void;
    signal?: AbortSignal;
  },
): Promise<
  | { ok: true; body: ReadableStream<Uint8Array>; response: Response }
  | { ok: false; status: number; error: string }
> {
  if (!response.body) {
    return { ok: false, status: 502, error: "Failed to read asset" };
  }

  const readFirstByte = (source: ReadableStreamDefaultReader<Uint8Array>) =>
    readWithTimeout(source.read(), assetId, {
      signal,
      timeoutMs: Math.max(0, Math.min(FIRST_BYTE_TIMEOUT_MS, deadlineAt - Date.now())),
    });
  const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

  let reader = response.body.getReader();
  let head: ReadableStreamReadResult<Uint8Array>;
  try {
    head = await readFirstByte(reader);
  } catch (headError) {
    try {
      await reader.cancel();
    } catch (cancelErr) {
      // Source already failed; nothing left to release
      logger.debug(`[stream-utils] Cancel failed for ${assetId}:`, cancelErr);
    }
    if (signal?.aborted) {
      return { ok: false, status: 504, error: "Asset fetch timed out" };
    }
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs < FIRST_BYTE_TIMEOUT_MS) {
      log(
        `First-byte stall for asset ${assetId} with ${remainingMs}ms left before the deadline; not retrying: ${errorText(headError)}`,
      );
      return { ok: false, status: 504, error: "Asset fetch timed out" };
    }
    log(`First-byte stall for asset ${assetId}; retrying upstream once: ${errorText(headError)}`);

    let retryResponse: Response;
    try {
      retryResponse = await refetch();
    } catch (refetchError) {
      log(`Retry fetch failed for asset ${assetId}: ${errorText(refetchError)}`);
      const timedOut = refetchError instanceof Error && refetchError.name === "AbortError";
      return {
        ok: false,
        status: timedOut ? 504 : 502,
        error: timedOut ? "Asset fetch timed out" : "Failed to fetch asset",
      };
    }
    if (!retryResponse.ok) {
      await retryResponse.body?.cancel();
      return { ok: false, status: retryResponse.status, error: "Failed to fetch asset" };
    }
    if (!retryResponse.body) {
      return { ok: false, status: 502, error: "Failed to read asset" };
    }
    response = retryResponse;
    reader = retryResponse.body.getReader();
    try {
      head = await readFirstByte(reader);
    } catch (retryHeadError) {
      log(`Retry first-byte stall for asset ${assetId}: ${errorText(retryHeadError)}`);
      try {
        await reader.cancel();
      } catch (cancelErr) {
        logger.debug(`[stream-utils] Cancel failed for ${assetId}:`, cancelErr);
      }
      return { ok: false, status: 504, error: "Asset fetch timed out" };
    }
  }

  // Replay the buffered first chunk ahead of the live reader so downstream
  // tee() and monitored consumers still see the complete body.
  let headValue: Uint8Array | undefined = head.done ? undefined : head.value;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (headValue !== undefined) {
        const value = headValue;
        headValue = undefined;
        controller.enqueue(value);
        return;
      }
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      if (value) {
        controller.enqueue(value);
      }
    },
    cancel(reason) {
      reader.cancel(reason).catch((err) => {
        logger.debug(`[stream-utils] Cancel in cleanup failed for ${assetId}:`, err);
      });
    },
  });
  return { ok: true, body, response };
}

/**
 * Buffers a stream with size and timeout limits
 */
export async function streamToBufferWithLimits(
  stream: ReadableStream<Uint8Array>,
  assetId: string,
): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  try {
    for (
      let result = await readWithTimeout(reader.read(), assetId);
      !result.done;
      result = await readWithTimeout(reader.read(), assetId)
    ) {
      const value = result.value;
      if (!value) {
        continue;
      }

      totalSize += value.byteLength;
      if (totalSize > MAX_ASSET_SIZE_BYTES) {
        throw new Error(
          `Image too large: ${totalSize} bytes exceeds ${MAX_ASSET_SIZE_BYTES} byte limit for asset ${assetId}`,
        );
      }

      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel(error).catch((cancelErr: unknown) => {
      logger.debug(`[stream-utils] Cancel failed for ${assetId}:`, cancelErr);
    });
    throw error;
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks);
}
