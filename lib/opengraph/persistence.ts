/**
 * OpenGraph Image Persistence Module
 *
 * Handles background image persistence to S3
 * Fire-and-forget operations that don't block responses
 *
 * @module opengraph/persistence
 */

import { debug } from "@/lib/utils/debug";
import { persistImageToS3 } from "@/lib/image-handling/image-s3-utils";

/**
 * Schedules image persistence to happen in the background without blocking the response
 *
 * @param imageUrl - URL of image to persist
 * @param s3Directory - S3 directory to store in
 * @param logContext - Context for logging
 * @param idempotencyKey - Unique key for idempotent storage
 * @param pageUrl - URL of the page the image belongs to
 */
export function scheduleImagePersistence(
  imageUrl: string,
  s3Directory: string,
  logContext: string,
  idempotencyKey?: string,
  pageUrl?: string,
): void {
  // Run in background - don't await or block
  persistImageToS3(imageUrl, s3Directory, logContext, idempotencyKey, pageUrl)
    .then((s3Key) => {
      if (s3Key) {
        debug(`[DataAccess/OpenGraph] Background persistence completed: ${s3Key}`);
      }
    })
    .catch((error) => {
      // Log error but don't throw - this is background processing
      const errorMessage = error instanceof Error ? error.message : String(error);
      debug(`[DataAccess/OpenGraph] Background persistence failed for ${imageUrl}: ${errorMessage}`);
    });
}
