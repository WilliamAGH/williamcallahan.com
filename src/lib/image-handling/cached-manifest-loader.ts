/**
 * Cached manifest loading functions for Next.js 15
 *
 * These functions use the experimental "use cache" directive and must be
 * in a separate module to work properly with Next.js 15's caching system.
 */

import { readJsonS3 } from "@/lib/s3-utils";
import { IMAGE_MANIFEST_S3_PATHS } from "@/lib/constants";
import { cacheContextGuards } from "@/lib/cache";
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
  cacheContextGuards.cacheLife("ImageManifest", profile);
};
const safeCacheTag = (...tags: string[]): void => {
  cacheContextGuards.cacheTag("ImageManifest", ...tags);
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
