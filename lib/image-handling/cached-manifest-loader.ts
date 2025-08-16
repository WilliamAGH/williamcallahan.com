/**
 * Cached manifest loading functions for Next.js 15
 *
 * These functions use the experimental "use cache" directive and must be
 * in a separate module to work properly with Next.js 15's caching system.
 */

import { readJsonS3 } from "@/lib/s3-utils";
import { IMAGE_MANIFEST_S3_PATHS } from "@/lib/constants";
import { unstable_cacheLife as cacheLife, unstable_cacheTag as cacheTag } from "next/cache";
import type { LogoManifest, ImageManifest } from "@/types/image";

// Runtime-safe wrappers for experimental cache APIs
const safeCacheLife = (
  profile:
    | "default"
    | "seconds"
    | "minutes"
    | "hours"
    | "days"
    | "weeks"
    | "max"
    | { stale?: number; revalidate?: number; expire?: number },
): void => {
  try {
    if (typeof cacheLife === "function") {
      cacheLife(profile);
    }
  } catch (error) {
    // Silently ignore if cacheLife is not available or experimental.useCache is not enabled
    if (process.env.NODE_ENV === "development") {
      console.warn("[ManifestLoader] cacheLife not available:", error);
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
      console.warn("[ManifestLoader] cacheTag not available:", error);
    }
  }
};

/**
 * Load all manifests with caching
 */
export async function loadManifestsWithCache() {
  "use cache";

  safeCacheLife("days");
  safeCacheTag("image-manifests");

  const [logos, opengraph, blog] = await Promise.all([
    readJsonS3<LogoManifest>(IMAGE_MANIFEST_S3_PATHS.LOGOS_MANIFEST),
    readJsonS3<ImageManifest>(IMAGE_MANIFEST_S3_PATHS.OPENGRAPH_MANIFEST),
    readJsonS3<ImageManifest>(IMAGE_MANIFEST_S3_PATHS.BLOG_IMAGES_MANIFEST),
  ]);

  return {
    logos: logos || {},
    opengraph: opengraph || [],
    blog: blog || [],
  };
}

/**
 * Load logo manifest with caching
 */
export async function loadLogoManifestWithCache() {
  "use cache";

  safeCacheLife("days");
  safeCacheTag("logo-manifest");

  const manifest = await readJsonS3<LogoManifest>(IMAGE_MANIFEST_S3_PATHS.LOGOS_MANIFEST);
  return manifest || {};
}
