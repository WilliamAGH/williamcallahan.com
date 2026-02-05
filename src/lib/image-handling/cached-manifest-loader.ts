/**
 * Cached manifest loading functions for Next.js 15
 *
 * These functions use the experimental "use cache" directive and must be
 * in a separate module to work properly with Next.js 15's caching system.
 */

import { readJsonS3 } from "@/lib/s3/json";
import { IMAGE_MANIFEST_S3_PATHS } from "@/lib/constants";
import { cacheContextGuards } from "@/lib/cache";
import {
  imageManifestSchema,
  logoManifestSchema,
  type ImageManifestFromSchema,
  type LogoManifestFromSchema,
} from "@/types/schemas/image-manifest";

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
    readJsonS3<LogoManifestFromSchema>(IMAGE_MANIFEST_S3_PATHS.LOGOS_MANIFEST, logoManifestSchema),
    readJsonS3<ImageManifestFromSchema>(
      IMAGE_MANIFEST_S3_PATHS.OPENGRAPH_MANIFEST,
      imageManifestSchema,
    ),
    readJsonS3<ImageManifestFromSchema>(
      IMAGE_MANIFEST_S3_PATHS.BLOG_IMAGES_MANIFEST,
      imageManifestSchema,
    ),
  ]);

  return {
    logos,
    opengraph,
    blog,
  };
}

/**
 * Load logo manifest with caching
 */
export async function loadLogoManifestWithCache() {
  "use cache";

  safeCacheLife("days");
  safeCacheTag("logo-manifest");

  return readJsonS3<LogoManifestFromSchema>(
    IMAGE_MANIFEST_S3_PATHS.LOGOS_MANIFEST,
    logoManifestSchema,
  );
}
