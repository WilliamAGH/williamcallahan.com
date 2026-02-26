/**
 * Image Manifest Loader
 *
 * Loads image manifests from PostgreSQL for logo and image resolution.
 * Startup warm-up is opt-in to avoid large boot-time allocations.
 *
 * @module lib/image-handling/image-manifest-loader
 */

import { USE_NEXTJS_CACHE } from "@/lib/constants";
import { readImageManifest } from "@/lib/db/queries/image-manifests";
import {
  imageManifestSchema,
  logoManifestSchema,
  type ImageManifestFromSchema,
  type LogoManifestEntryFromSchema,
  type LogoManifestFromSchema,
} from "@/types/schemas/image-manifest";
import { loadLogoManifestWithCache } from "./cached-manifest-loader";

// Module-local cache for manifests
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
 * Direct manifest loading from PostgreSQL (no Next.js cache)
 */
async function getManifestsDirect(): Promise<{
  logos: LogoManifestFromSchema;
  opengraph: ImageManifestFromSchema;
  blog: ImageManifestFromSchema;
}> {
  const [rawLogos, rawOpengraph, rawBlog] = await Promise.all([
    readImageManifest("logos"),
    readImageManifest("opengraph"),
    readImageManifest("blog"),
  ]);

  return {
    logos: logoManifestSchema.parse(rawLogos ?? {}),
    opengraph: imageManifestSchema.parse(rawOpengraph ?? []),
    blog: imageManifestSchema.parse(rawBlog ?? []),
  };
}

/**
 * Load all image manifests from PostgreSQL
 * Called once during instrumentation/startup
 */
export async function loadImageManifests(): Promise<void> {
  // Warm-up is opt-in to avoid extra boot-time allocations in constrained runtimes.
  if (process.env.LOAD_IMAGE_MANIFESTS_AT_BOOT !== "true") {
    return;
  }

  console.log("[ImageManifestLoader] Loading image manifests from PostgreSQL...");

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
