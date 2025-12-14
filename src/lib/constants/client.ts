/**
 * Client-Safe Constants
 *
 * CRITICAL: This file contains ONLY constants that are safe for client-side usage.
 *
 * HYDRATION FIX CONTEXT:
 * =====================
 * The original lib/constants.ts file caused critical hydration errors because it imported
 * server-only dependencies (S3 utilities → AWS SDK → crypto → node:async_hooks).
 * When client components imported constants, they inadvertently pulled in these server
 * dependencies, causing the build to fail with:
 * "the chunking context (unknown) does not support external modules (request: node:async_hooks)"
 *
 * This file solves the hydration problem by containing ONLY the 3 constants actually
 * needed by client components, with zero server dependencies.
 *
 * DO NOT ADD:
 * - Any imports from server-only modules (S3, crypto, fs, etc.)
 * - Any process.env access
 * - Any dynamic values that differ between server/client
 * - Any non-serializable values
 *
 * @see https://github.com/WilliamAGH/williamcallahan.com/issues/175
 */

/**
 * Key for storing theme toggle timestamp in localStorage.
 * Used by theme components to track when the user last changed themes.
 */
export const THEME_TIMESTAMP_KEY = "theme-timestamp";

/**
 * Time constants used by client components.
 * Only includes the subset needed on the client side.
 */
export const TIME_CONSTANTS = {
  /** 24 hours in milliseconds - used for theme timestamp validation */
  TWENTY_FOUR_HOURS_MS: 24 * 60 * 60 * 1000,
} as const;

/**
 * Default images needed by client components.
 * Values are hardcoded to avoid importing server-side image resolvers.
 *
 * IMPORTANT: If these URLs change in the S3 mapping, they must be manually updated here.
 * This duplication is intentional to maintain the client/server boundary.
 */
export const DEFAULT_IMAGES = {
  /** OpenGraph logo fallback - hardcoded S3 URL to avoid server imports */
  OPENGRAPH_LOGO: "https://s3-storage.callahan.cloud/images/other/profile/william-sf_94bf11cf.png",
} as const;

/**
 * Site URL for client-side usage.
 * Hardcoded to avoid process.env access in client components.
 *
 * IMPORTANT: This must match the NEXT_PUBLIC_SITE_URL environment variable.
 * Update this value if the production URL changes.
 */
export const NEXT_PUBLIC_SITE_URL = "https://williamcallahan.com";
