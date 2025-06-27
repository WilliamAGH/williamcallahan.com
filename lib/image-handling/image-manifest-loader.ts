/**
 * Image Manifest Loader
 *
 * Loads and caches image manifests from S3 to prevent runtime image fetches.
 * Manifests are loaded once at startup and cached in memory.
 *
 * @module lib/image-handling/image-manifest-loader
 */

import { readJsonS3 } from "@/lib/s3-utils";
import { IMAGE_MANIFEST_S3_PATHS } from "@/lib/constants";
import type { LogoManifest, ImageManifest, LogoManifestEntry } from "@/types/image";

// In-memory cache for manifests
let logoManifest: LogoManifest | null = null;
let opengraphManifest: ImageManifest | null = null;
let blogManifest: ImageManifest | null = null;

// Loading state to prevent concurrent loads
let isLoading = false;
let loadingPromise: Promise<void> | null = null;

/**
 * Load all image manifests from S3
 * Called once during instrumentation/startup
 */
export async function loadImageManifests(): Promise<void> {
  // In low-memory situations (local dev or constrained containers) we avoid
  // the upfront 150-200 MB cost of loading three large manifest JSON files.
  // If the caller really needs them at boot they can set
  // `LOAD_IMAGE_MANIFESTS_AT_BOOT=true` in the environment.

  if (!process.env.LOAD_IMAGE_MANIFESTS_AT_BOOT) {
    logoManifest = {};
    opengraphManifest = [];
    blogManifest = [];
    return; // Lazy loading will kick-in on first access
  }

  console.log("[ImageManifestLoader] Loading image manifests from S3...");

  try {
    // Load manifests in parallel
    const [logos, opengraph, blog] = await Promise.all([
      readJsonS3<LogoManifest>(IMAGE_MANIFEST_S3_PATHS.LOGOS_MANIFEST),
      readJsonS3<ImageManifest>(IMAGE_MANIFEST_S3_PATHS.OPENGRAPH_MANIFEST),
      readJsonS3<ImageManifest>(IMAGE_MANIFEST_S3_PATHS.BLOG_IMAGES_MANIFEST),
    ]);

    // Cache manifests
    logoManifest = logos || {};
    opengraphManifest = opengraph || [];
    blogManifest = blog || [];

    const logoCount = Object.keys(logoManifest).length;
    const totalImages = logoCount + (opengraphManifest?.length || 0) + (blogManifest?.length || 0);

    console.log(`[ImageManifestLoader] Loaded ${totalImages} images from manifests (${logoCount} logos)`);
  } catch (error) {
    console.error("[ImageManifestLoader] Failed to load image manifests:", error);
    // Initialize with empty manifests on error
    logoManifest = {};
    opengraphManifest = [];
    blogManifest = [];
  }
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
export function getLogoFromManifest(domain: string): LogoManifestEntry | null {
  if (!logoManifest) {
    console.warn(`[ImageManifestLoader] Logo manifest not loaded when looking up domain: ${domain}`);
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
export async function getLogoFromManifestAsync(domain: string): Promise<LogoManifestEntry | null> {
  await ensureManifestsLoaded();
  return getLogoFromManifest(domain);
}

/**
 * Get all logos from manifest
 * @returns Logo manifest object
 */
export function getAllLogosFromManifest(): LogoManifest {
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
