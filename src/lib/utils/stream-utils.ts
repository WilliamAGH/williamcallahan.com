/**
 * Stream utilities for asset processing
 * @module lib/utils/stream-utils
 */

import logger from "./logger";

const ASSET_STREAM_TIMEOUT_MS = 20_000; // 20 seconds
const MAX_ASSET_SIZE_BYTES = 50 * 1024 * 1024; // 50MB limit

/**
 * Wraps a promise with a timeout
 */
export async function readWithTimeout<T>(
  promise: Promise<T>,
  assetId: string,
  signal?: AbortSignal,
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
    }, ASSET_STREAM_TIMEOUT_MS);
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
            const sizeError = new Error(
              `Image too large: ${processedBytes} bytes exceeds ${MAX_ASSET_SIZE_BYTES} byte limit for asset ${assetId}`,
            );
            onViolation?.(sizeError);
            try {
              await reader.cancel(sizeError);
            } catch (cancelErr) {
              // Cancel can fail if stream already closed - log for debugging
              logger.debug(`[stream-utils] Cancel failed for ${assetId}:`, cancelErr);
            }
            controller.error(sizeError);
            return;
          }

          controller.enqueue(value);
        }
      } catch (error) {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        onViolation?.(normalizedError);
        try {
          await reader.cancel(normalizedError);
        } catch (cancelErr) {
          // Cancel can fail if stream already closed - log for debugging
          logger.debug(`[stream-utils] Cancel failed:`, cancelErr);
        }
        controller.error(normalizedError);
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
 * response, so the upstream request is retried once through `refetch`;
 * a stall after the first byte is left for stream consumers to surface.
 */
export async function streamBodyAfterFirstByte(
  response: Response,
  refetch: () => Promise<Response>,
  assetId: string,
  onRetry?: (message: string) => void,
  signal?: AbortSignal,
): Promise<
  | { ok: true; body: ReadableStream<Uint8Array>; response: Response }
  | { ok: false; status: number; error: string }
> {
  if (!response.body) {
    return { ok: false, status: 502, error: "Failed to read asset" };
  }

  let reader = response.body.getReader();
  let head: ReadableStreamReadResult<Uint8Array>;
  try {
    head = await readWithTimeout(reader.read(), assetId, signal);
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
    onRetry?.(
      `First-byte stall for asset ${assetId}; retrying upstream once: ${
        headError instanceof Error ? headError.message : String(headError)
      }`,
    );

    let retryResponse: Response;
    try {
      retryResponse = await refetch();
    } catch (refetchError) {
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
      head = await readWithTimeout(reader.read(), assetId, signal);
    } catch {
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
        const sizeError = new Error(
          `Image too large: ${totalSize} bytes exceeds ${MAX_ASSET_SIZE_BYTES} byte limit for asset ${assetId}`,
        );
        try {
          await reader.cancel(sizeError);
        } catch (cancelErr) {
          // Cancel can fail if stream already closed - log for debugging
          logger.debug(`[stream-utils] Cancel failed for ${assetId}:`, cancelErr);
        }
        throw sizeError;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks);
}
