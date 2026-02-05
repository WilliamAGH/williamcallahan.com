/**
 * S3 Stream Utilities
 *
 * Stream-to-buffer conversion with size limit protection.
 *
 * @module lib/s3/stream
 */

import { Readable } from "node:stream";
import { S3_SIZE_LIMITS } from "@/lib/constants";

/** Convert stream to buffer with size limit protection */
export async function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    let timeoutId: NodeJS.Timeout | undefined;

    timeoutId = setTimeout(() => {
      stream.destroy();
      chunks.length = 0;
      reject(new Error(`Stream timeout: took longer than ${S3_SIZE_LIMITS.STREAM_TIMEOUT_MS}ms`));
    }, S3_SIZE_LIMITS.STREAM_TIMEOUT_MS);

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };

    stream.on("data", (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > S3_SIZE_LIMITS.MAX_READ_SIZE) {
        cleanup();
        stream.destroy();
        chunks.length = 0;
        reject(
          new Error(
            `Stream too large: ${totalSize} bytes exceeds ${S3_SIZE_LIMITS.MAX_READ_SIZE} bytes`,
          ),
        );
        return;
      }
      chunks.push(chunk);
    });

    stream.on("error", (error) => {
      cleanup();
      reject(error);
    });
    stream.on("end", () => {
      cleanup();
      resolve(Buffer.concat(chunks));
    });
    stream.on("close", () => cleanup());
  });
}
