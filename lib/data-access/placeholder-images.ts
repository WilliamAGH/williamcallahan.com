/**
 * Placeholder Image Registry  (💡 keep **constants** here, not logic)
 * ---------------------------------------------------------------------------
 * • Owns the canonical list of "fallback" or "placeholder" assets that must be
 *   shippable inside the repo so that **every build works offline**.
 * • Converts those local paths to CDN URLs via `getStaticImageUrl` *only at
 *   call-time*; it does **not** attempt to maintain its own mapping table.
 *
 * This separation lets `static-images.ts` focus exclusively on *mapping logic*
 * while this file focuses on *domain semantics* (what counts as a placeholder
 * and how the app reasons about that).
 *
 * KEEPING LOCAL COPIES: even though the CDN hosts the same bytes, these assets
 * remain in `public/` so that first-paint and local dev never suffer a network
 * round-trip.
 */

import { getStaticImageUrl } from "./static-images";

// Define which images are placeholders/fallbacks
export const PLACEHOLDER_IMAGES = {
  // Company/Logo placeholders
  COMPANY_PLACEHOLDER: "/images/company-placeholder.svg",

  // Profile/OpenGraph defaults
  OPENGRAPH_LOGO: "/images/william-callahan-san-francisco.png",
  DEFAULT_PROFILE: "/images/william.jpeg",

  // Social media profile fallbacks
  SOCIAL_PROFILES: {
    GITHUB: "/images/social-pics/github.jpg",
    TWITTER: "/images/social-pics/x.jpg",
    LINKEDIN: "/images/social-pics/linkedin.jpg",
    BLUESKY: "/images/social-pics/bluesky.jpg",
    DISCORD: "/images/social-pics/discord.jpg",
  },

  // Social media banner fallbacks
  SOCIAL_BANNERS: {
    GITHUB: "/images/social-banners/github.svg",
    TWITTER: "/images/social-banners/twitter-x.svg",
    LINKEDIN: "/images/social-banners/linkedin.svg",
    BLUESKY: "/images/social-banners/bluesky.png",
    DISCORD: "/images/social-banners/discord.svg",
  },
} as const;

/**
 * Get placeholder image URL with fallback to local if S3 fails
 * This ensures placeholders always work, even if S3 is down
 */
export function getPlaceholderImageUrl(localPath: string): string {
  try {
    // Try to get S3 URL first for CDN benefits
    return getStaticImageUrl(localPath);
  } catch {
    // Fallback to local path if S3 mapping fails
    console.warn(`Falling back to local placeholder: ${localPath}`);
    return localPath;
  }
}

/**
 * Check if an image path is a placeholder
 */
export function isPlaceholderImage(imagePath: string): boolean {
  const placeholderPaths = [
    ...Object.values(PLACEHOLDER_IMAGES),
    ...Object.values(PLACEHOLDER_IMAGES.SOCIAL_PROFILES),
    ...Object.values(PLACEHOLDER_IMAGES.SOCIAL_BANNERS),
  ];

  return placeholderPaths.some((placeholder) => typeof placeholder === "string" && imagePath.includes(placeholder));
}

/**
 * Get the company placeholder image URL
 */
export function getCompanyPlaceholder(): string {
  return getPlaceholderImageUrl(PLACEHOLDER_IMAGES.COMPANY_PLACEHOLDER);
}
