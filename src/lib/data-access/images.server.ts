import "server-only";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";
import { cacheContextGuards } from "@/lib/cache";

// S3 is PERSISTENT STORAGE, not a cache!
// This module caches data retrieved FROM S3 to reduce storage reads.

// Runtime-safe wrappers for experimental cache APIs
const safeCacheLife = (...args: Parameters<typeof cacheContextGuards.cacheLife>): void => {
  cacheContextGuards.cacheLife(...args);
};
const safeCacheTag = (...args: Parameters<typeof cacheContextGuards.cacheTag>): void => {
  cacheContextGuards.cacheTag(...args);
};
const safeRevalidateTag = (...args: Parameters<typeof cacheContextGuards.revalidateTag>): void => {
  cacheContextGuards.revalidateTag(...args);
};

const s3Client = new S3Client({ region: env.S3_REGION });

/**
 * Fetches an image buffer from S3 storage and caches the result.
 * S3 is our persistent storage (NOT a cache). This function adds a caching layer
 * on top of S3 to reduce storage reads for frequently accessed images.
 *
 * @param key The S3 object key.
 * @returns A Promise that resolves to the image buffer from S3 storage.
 */
export async function getImageFromS3StorageForCache(key: string): Promise<Buffer> {
  "use cache";

  safeCacheLife("Images", "weeks"); // Use predefined profile for consistency
  safeCacheTag("Images", "image");
  const imageKeyTag = `image-key-${key.replace(/[^a-zA-Z0-9-]/g, "-")}`;
  safeCacheTag("Images", imageKeyTag);

  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
  });

  try {
    const response = await s3Client.send(command);
    if (!response.Body) {
      throw new Error(`No body in S3 response for key: ${key}`);
    }
    return Buffer.from(await response.Body.transformToByteArray());
  } catch (error) {
    console.error(`Failed to fetch image from S3 with key: ${key}`, error);
    throw error;
  }
}

// Cache invalidation function for images
export function invalidateImageCache(key?: string): void {
  if (key) {
    // Invalidate specific image
    const imageKeyTag = `image-key-${key.replace(/[^a-zA-Z0-9-]/g, "-")}`;
    safeRevalidateTag("Images", imageKeyTag);
    console.log(`[Images] Cache invalidated for image: ${key}`);
  } else {
    // Invalidate all images
    safeRevalidateTag("Images", "image");
    console.log("[Images] Cache invalidated for all images");
  }
}
