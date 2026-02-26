/**
 * Cached manifest loading functions for Next.js cache components
 *
 * These functions use the "use cache" directive and must be
 * in a separate module to work properly with Next.js caching system.
 */

import { readImageManifest } from "@/lib/db/queries/image-manifests";
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

  const [rawLogos, rawOpengraph, rawBlog] = await Promise.all([
    readImageManifest("logos"),
    readImageManifest("opengraph"),
    readImageManifest("blog"),
  ]);

  return {
    logos: logoManifestSchema.parse(rawLogos ?? {}) as LogoManifestFromSchema,
    opengraph: imageManifestSchema.parse(rawOpengraph ?? []) as ImageManifestFromSchema,
    blog: imageManifestSchema.parse(rawBlog ?? []) as ImageManifestFromSchema,
  };
}

/**
 * Load logo manifest with caching
 */
export async function loadLogoManifestWithCache(): Promise<LogoManifestFromSchema> {
  "use cache";

  safeCacheLife("days");
  safeCacheTag("logo-manifest");

  const raw = await readImageManifest("logos");
  return logoManifestSchema.parse(raw ?? {});
}
