import "server-only";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";
import { unstable_cacheLife as cacheLife, unstable_cacheTag as cacheTag, revalidateTag } from "next/cache";

// S3 is PERSISTENT STORAGE, not a cache!
// This module caches data retrieved FROM S3 to reduce storage reads.

// Runtime-safe wrappers for experimental cache APIs
const safeCacheLife = (
  profile: "default" | "seconds" | "minutes" | "hours" | "days" | "weeks" | "max" | { stale?: number; revalidate?: number; expire?: number }
): void => {
  try {
    if (typeof cacheLife === "function") {
      cacheLife(profile);
    }
  } catch (error) {
    // Silently ignore if cacheLife is not available or experimental.useCache is not enabled
    if (process.env.NODE_ENV === "development") {
      console.warn("[Images] cacheLife not available:", error);
    }
  }
};
const safeCacheTag = (tag: string): void => {
  try {
    if (typeof cacheTag === "function") {
      cacheTag(tag);
    }
  } catch (error) {
    // Silently ignore if cacheTag is not available
    if (process.env.NODE_ENV === "development") {
      console.warn("[Images] cacheTag not available:", error);
    }
  }
};
const safeRevalidateTag = (tag: string): void => {
  try {
    if (typeof revalidateTag === "function") {
      revalidateTag(tag);
    }
  } catch (error) {
    // Silently ignore if revalidateTag is not available
    if (process.env.NODE_ENV === "development") {
      console.warn("[Images] revalidateTag not available:", error);
    }
  }
};

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
  const imageKeyTag = `image-key-${key.replace(/[^a-zA-Z0-9-]/g, "-")}`;
  safeCacheTag(imageKeyTag);

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
    safeRevalidateTag(imageKeyTag);
    console.log(`[Images] Cache invalidated for image: ${key}`);
  } else {
    // Invalidate all images
    safeRevalidateTag("image");
    console.log("[Images] Cache invalidated for all images");
  }
}
