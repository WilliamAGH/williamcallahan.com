/**
 * Image Manifest Loader
 *
 * Loads and caches image manifests from S3 to prevent runtime image fetches.
 * Manifests are loaded once at startup and cached in memory.
 *
 * @module lib/image-handling/image-manifest-loader
 */

import { readJsonS3 } from "@/lib/s3/json";
import { IMAGE_MANIFEST_S3_PATHS, USE_NEXTJS_CACHE } from "@/lib/constants";
import {
  imageManifestSchema,
  logoManifestSchema,
  type ImageManifestFromSchema,
  type LogoManifestEntryFromSchema,
  type LogoManifestFromSchema,
} from "@/types/schemas/image-manifest";
import { loadLogoManifestWithCache } from "./cached-manifest-loader";

// In-memory cache for manifests
let logoManifest: LogoManifestFromSchema | null = null;
let opengraphManifest: ImageManifestFromSchema | null = null;
let blogManifest: ImageManifestFromSchema | null = null;
let hasLoggedProductionRuntimeManifestSkip = false;

// Loading state to prevent concurrent loads
let isLoading = false;
let loadingPromise: Promise<void> | null = null;

const BUILD_PHASE = "phase-production-build" as const;
const isProductionNodeRuntime = (): boolean =>
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_RUNTIME === "nodejs" &&
  process.env.NEXT_PHASE !== BUILD_PHASE;

/**
 * Direct manifest loading (no cache)
 */
async function getManifestsDirect(): Promise<{
  logos: LogoManifestFromSchema;
  opengraph: ImageManifestFromSchema;
  blog: ImageManifestFromSchema;
}> {
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
 * Load all image manifests from S3
 * Called once during instrumentation/startup
 */
export async function loadImageManifests(): Promise<void> {
  // In low-memory situations (local dev or constrained containers) we avoid
  // the upfront 150-200 MB cost of loading three large manifest JSON files.
  // By default manifests are loaded at boot. To disable, set
  // `LOAD_IMAGE_MANIFESTS_AT_BOOT=false` in the environment.

  // Default to loading manifests unless explicitly disabled
  if (process.env.LOAD_IMAGE_MANIFESTS_AT_BOOT === "false") {
    return;
  }

  console.log("[ImageManifestLoader] Loading image manifests from S3...");

  // During instrumentation/startup, we can't use "use cache" functions
  // Always use direct loading here - the cache functions are for runtime use
  const manifests = await getManifestsDirect();

  // Cache manifests
  logoManifest = manifests.logos;
  opengraphManifest = manifests.opengraph;
  blogManifest = manifests.blog;

  const logoCount = Object.keys(logoManifest).length;
  const totalImages = logoCount + (opengraphManifest?.length || 0) + (blogManifest?.length || 0);

  console.log(
    `[ImageManifestLoader] Loaded ${totalImages} images from manifests (${logoCount} logos)`,
  );
}

/**
 * Ensure manifests are loaded (lazy loading with singleton pattern)
 * @returns Promise that resolves when manifests are loaded
 */
async function ensureManifestsLoaded(): Promise<void> {
  // If already loaded, return immediately
  if (logoManifest !== null) {
    return;
  }
  // If currently loading, wait for the existing load to complete
  if (isLoading && loadingPromise) {
    return loadingPromise;
  }

  // Start loading
  isLoading = true;
  loadingPromise = loadImageManifests().finally(() => {
    isLoading = false;
    loadingPromise = null;
  });

  return loadingPromise;
}

/**
 * Get logo info from manifest
 * @param domain - Domain to lookup
 * @returns Logo manifest entry if found, null otherwise
 */
export function getLogoFromManifest(domain: string): LogoManifestEntryFromSchema | null {
  if (!logoManifest) {
    console.warn(
      `[ImageManifestLoader] Logo manifest not loaded when looking up domain: ${domain}`,
    );
    // Instead of warning every time, return null silently
    // The manifest will be loaded on demand if needed
    return null;
  }

  const entry = logoManifest[domain];
  if (!entry) {
    console.log(
      `[ImageManifestLoader] Domain ${domain} not found in manifest (${Object.keys(logoManifest).length} total entries)`,
    );
  }

  return entry || null;
}

/**
 * Get logo info from manifest with lazy loading
 * @param domain - Domain to lookup
 * @returns Promise that resolves to logo manifest entry if found, null otherwise
 */
export async function getLogoFromManifestAsync(
  domain: string,
): Promise<LogoManifestEntryFromSchema | null> {
  // Fast path for warmed manifest cache.
  if (logoManifest) {
    return logoManifest[domain] || null;
  }

  // In production Next.js runtime, avoid request-path manifest fetches.
  // These can trigger cache-component prerender clock IO guards via SDK internals.
  if (isProductionNodeRuntime()) {
    if (!hasLoggedProductionRuntimeManifestSkip) {
      hasLoggedProductionRuntimeManifestSkip = true;
      console.warn(
        "[ImageManifestLoader] Logo manifest is unavailable in production runtime; skipping request-time manifest fetch and using fallback logo behavior.",
      );
    }
    return null;
  }

  if (USE_NEXTJS_CACHE) {
    try {
      // Use the cached manifest loader
      const manifest = await loadLogoManifestWithCache();
      logoManifest = manifest; // Update in-memory cache
      return manifest[domain] || null;
    } catch (error) {
      console.warn(
        "[ImageManifestLoader] Cache function failed for logo lookup, using direct load:",
        error,
      );
      await ensureManifestsLoaded();
      return getLogoFromManifest(domain);
    }
  }

  await ensureManifestsLoaded();
  return getLogoFromManifest(domain);
}

/**
 * Get all logos from manifest
 * @returns Logo manifest object
 */
export function getAllLogosFromManifest(): LogoManifestFromSchema {
  return logoManifest || {};
}

/**
 * Get OpenGraph images from manifest
 * @returns Array of CDN URLs
 */
export function getOpengraphImagesFromManifest(): string[] {
  return opengraphManifest || [];
}

/**
 * Get blog images from manifest
 * @returns Array of CDN URLs
 */
export function getBlogImagesFromManifest(): string[] {
  return blogManifest || [];
}

/**
 * Check if manifests are loaded
 * @returns True if manifests are loaded
 */
export function areManifestsLoaded(): boolean {
  return logoManifest !== null;
}
