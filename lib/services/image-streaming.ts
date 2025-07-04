/**
 * Image Streaming Service
 *
 * Handles streaming of large images directly to S3 without loading into memory.
 * Prevents memory exhaustion for images > 5MB by using stream pipelines.
 *
 * @module lib/services/image-streaming
 */

import { Upload, type Progress } from "@aws-sdk/lib-storage";
import { Readable, Transform } from "node:stream";
import type { StreamToS3Options, StreamingResult } from "@/types/s3-cdn";
import { guessImageContentType } from "../utils/content-type";

/**
 * Stream monitor transform - tracks bytes without modifying stream
 */
class StreamMonitor extends Transform {
  private bytesStreamed = 0;
  private maxSize = 100 * 1024 * 1024; // 100MB max to prevent memory exhaustion

  _transform(chunk: Buffer, _encoding: string, callback: (error?: Error) => void): void {
    this.bytesStreamed += chunk.length;

    // Check for size limits to prevent memory exhaustion
    if (this.bytesStreamed > this.maxSize) {
      const error = new Error(`Stream too large: ${this.bytesStreamed} bytes exceeds ${this.maxSize} bytes`);
      this.destroy(error);
      callback(error);
      return;
    }

    this.push(chunk);
    callback();
  }

  _flush(callback: (error?: Error) => void): void {
    // Ensure cleanup on stream end
    callback();
  }

  getBytesStreamed(): number {
    return this.bytesStreamed;
  }

  destroy(error?: Error): this {
    // Ensure proper cleanup
    return super.destroy(error);
  }
}

/**
 * Stream a response directly to S3 without loading into memory
 * Used for large images to prevent memory exhaustion
 */
export async function streamToS3(
  responseStream: ReadableStream<Uint8Array> | Readable,
  options: StreamToS3Options,
): Promise<StreamingResult> {
  const monitor = new StreamMonitor();
  let nodeStream: Readable | null = null;
  let timeoutId: NodeJS.Timeout | null = null;

  try {
    // Set timeout to prevent hanging streams
    const STREAM_TIMEOUT_MS = 300000; // 5 minutes
    timeoutId = setTimeout(() => {
      console.error(`[ImageStreaming] Stream timeout after ${STREAM_TIMEOUT_MS}ms`);
      if (nodeStream) {
        nodeStream.destroy();
      }
    }, STREAM_TIMEOUT_MS);

    // Convert Web ReadableStream to Node.js stream if needed
    if (responseStream instanceof Readable) {
      nodeStream = responseStream;
    } else {
      // Web ReadableStream to Node.js Readable
      nodeStream = Readable.fromWeb(responseStream as unknown as import("stream/web").ReadableStream);
    }

    // Use AWS SDK v3 Upload for streaming
    const upload = new Upload({
      client: options.s3Client,
      params: {
        Bucket: options.bucket,
        Key: options.key,
        Body: nodeStream.pipe(monitor),
        ContentType: options.contentType,
        CacheControl: "public, max-age=31536000, immutable",
      },
      queueSize: 3, // Limit concurrent parts
      partSize: 5 * 1024 * 1024, // 5MB parts
    });

    // Monitor upload progress with proper error handling
    upload.on("httpUploadProgress", (progress: Progress) => {
      try {
        if (progress.loaded && progress.total) {
          const percent = Math.round((progress.loaded / progress.total) * 100);
          console.log(`[ImageStreaming] Upload progress for ${options.key}: ${percent}%`);
        }
      } catch (progressError) {
        const errorMessage = progressError instanceof Error ? progressError.message : String(progressError);
        console.warn(`[ImageStreaming] Error logging progress: ${errorMessage}`);
      }
    });

    const result = await upload.done();

    if (!result || !result.Location) {
      throw new Error("S3 upload finished without returning a location.");
    }

    return {
      success: true,
      location: result.Location,
      bytesStreamed: monitor.getBytesStreamed(),
    };
  } catch (error: unknown) {
    console.error(`[ImageStreaming] Failed to stream to S3:`, error);
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      bytesStreamed: monitor.getBytesStreamed(),
    };
  } finally {
    // Cleanup resources
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Ensure stream is properly closed
    if (nodeStream && !nodeStream.destroyed) {
      try {
        nodeStream.destroy();
      } catch (cleanupError) {
        console.warn("[ImageStreaming] Error during stream cleanup:", cleanupError);
      }
    }
  }
}

/**
 * Check if response indicates a large image that should be streamed
 */
export function shouldStreamImage(contentLength: string | null): boolean {
  if (!contentLength) return false;

  const bytes = parseInt(contentLength, 10);
  const streamThreshold = Number(process.env.IMAGE_STREAM_THRESHOLD_BYTES ?? 5 * 1024 * 1024); // 5MB default

  return !Number.isNaN(bytes) && bytes > streamThreshold;
}

// NEW: thin wrapper for services that simply want a boolean return
// indicating whether the image was streamed. This keeps UnifiedImageService
// lean – it delegates the decision of whether to stream to this helper and
// avoids duplicating threshold logic.
export async function maybeStreamImageToS3(
  response: Response,
  options: { bucket: string; key: string; s3Client: import("@aws-sdk/client-s3").S3Client },
): Promise<boolean> {
  try {
    // Only attempt if response has a body and we consider the object big
    const contentLengthHeader = response.headers.get("content-length");

    if (!shouldStreamImage(contentLengthHeader) || !response.body) {
      return false; // Not eligible → caller should fall back to Buffer path
    }

    const contentType = guessImageContentType(response.url, response.headers.get("content-type"));
    const { success } = await streamToS3(response.body, {
      bucket: options.bucket,
      key: options.key,
      contentType,
      s3Client: options.s3Client,
    });

    return success;
  } catch (err) {
    // Treat any error as non-fatal → caller will buffer instead
    console.warn("[ImageStreaming] maybeStreamImageToS3: falling back to buffer path –", err);
    return false;
  }
}
