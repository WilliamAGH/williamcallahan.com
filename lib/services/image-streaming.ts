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
import type { Response } from "node-fetch";
import type { StreamToS3Options, StreamingResult } from "@/types/s3";

/**
 * Stream monitor transform - tracks bytes without modifying stream
 */
class StreamMonitor extends Transform {
  private bytesStreamed = 0;

  _transform(chunk: Buffer, _encoding: string, callback: () => void): void {
    this.bytesStreamed += chunk.length;
    this.push(chunk);
    callback();
  }

  getBytesStreamed(): number {
    return this.bytesStreamed;
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

  try {
    // Convert Web ReadableStream to Node.js stream if needed
    let nodeStream: Readable;
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

/**
 * Get content type from response headers with fallback
 */
export function getContentTypeFromResponse(response: Response): string {
  const contentType = response.headers.get("content-type");

  // Common image MIME types
  if (!contentType || contentType === "application/octet-stream") {
    const url = response.url.toLowerCase();
    if (url.endsWith(".png")) return "image/png";
    if (url.endsWith(".jpg") || url.endsWith(".jpeg")) return "image/jpeg";
    if (url.endsWith(".gif")) return "image/gif";
    if (url.endsWith(".webp")) return "image/webp";
    if (url.endsWith(".svg")) return "image/svg+xml";
    if (url.endsWith(".ico")) return "image/x-icon";
  }

  return contentType || "image/png"; // Default fallback
}
