import "server-only";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";
import { unstable_cacheLife as cacheLife, unstable_cacheTag as cacheTag, revalidateTag } from "next/cache";

// S3 is PERSISTENT STORAGE, not a cache!
// This module caches data retrieved FROM S3 to reduce storage reads.

// Type assertions for cache functions to fix ESLint unsafe call errors
const safeCacheLife = cacheLife as (profile: string) => void;
const safeCacheTag = cacheTag as (tag: string) => void;
const safeRevalidateTag = revalidateTag as (tag: string) => void;

const s3Client = new S3Client({ region: env.AWS_REGION });

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

  safeCacheLife("weeks"); // Use predefined profile for consistency
  safeCacheTag("image");
  safeCacheTag(`image-key-${key}`);

  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
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
    safeRevalidateTag(`image-key-${key}`);
    console.log(`[Images] Cache invalidated for image: ${key}`);
  } else {
    // Invalidate all images
    safeRevalidateTag("image");
    console.log("[Images] Cache invalidated for all images");
  }
}
