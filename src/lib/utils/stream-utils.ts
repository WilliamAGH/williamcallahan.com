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
export async function readWithTimeout<T>(promise: Promise<T>, assetId: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Read timeout exceeded for asset ${assetId}`));
    }, ASSET_STREAM_TIMEOUT_MS);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
        return null;
      })
      .catch((error) => {
        clearTimeout(timeoutId);
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
