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
    let settled = false;
    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutMessage = `Stream timeout: took longer than ${S3_SIZE_LIMITS.STREAM_TIMEOUT_MS}ms`;

    const clearIdleTimeout = () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };

    const cleanup = () => {
      clearIdleTimeout();
      stream.removeListener("data", onData);
      stream.removeListener("error", onError);
      stream.removeListener("end", onEnd);
      stream.removeListener("close", onClose);
      chunks.length = 0;
    };

    const resolveOnce = (buffer: Buffer) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(buffer);
    };

    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const scheduleTimeout = () => {
      if (settled) return;
      clearIdleTimeout();
      timeoutId = setTimeout(() => {
        rejectOnce(new Error(timeoutMessage));
        if (!stream.destroyed) stream.destroy();
      }, S3_SIZE_LIMITS.STREAM_TIMEOUT_MS);
    };

    function onData(chunk: Buffer): void {
      scheduleTimeout();
      totalSize += chunk.length;
      if (totalSize > S3_SIZE_LIMITS.MAX_READ_SIZE) {
        rejectOnce(
          new Error(
            `Stream too large: ${totalSize} bytes exceeds ${S3_SIZE_LIMITS.MAX_READ_SIZE} bytes`,
          ),
        );
        if (!stream.destroyed) stream.destroy();
        return;
      }
      chunks.push(chunk);
    }

    function onError(error: Error): void {
      rejectOnce(error);
    }

    function onEnd(): void {
      resolveOnce(Buffer.concat(chunks));
    }

    function onClose(): void {
      rejectOnce(new Error("Premature close: stream closed before reaching end."));
    }

    stream.on("error", onError);
    stream.on("end", onEnd);
    stream.on("close", onClose);
    stream.on("data", onData);
    // Guard against idle streams while allowing long active transfers.
    scheduleTimeout();
  });
}
