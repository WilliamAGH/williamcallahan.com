/**
 * OpenGraph Fallback Module
 * 
 * Unified fallback logic for OpenGraph images and metadata
 * Single source of truth for all fallback handling
 * 
 * @module opengraph/fallback
 */

// debug import removed - using console.log for fallback logging
import { getDomainType, isValidImageUrl, constructKarakeepAssetUrl } from "@/lib/utils/opengraph-utils";
import { scheduleImagePersistence } from "./persistence";
import { OPENGRAPH_IMAGES_S3_DIR, SOCIAL_PLATFORMS } from "./constants";
import type { OgResult, KarakeepImageFallback } from "@/types";

/**
 * Creates a fallback result when OpenGraph data cannot be fetched
 * Prioritizes Karakeep image data when available before falling back to domain defaults
 *
 * @param url - Original URL
 * @param error - Error message
 * @param fallbackImageData - Optional Karakeep image data to use as fallback
 * @returns Fallback OpenGraph result
 */
export function createFallbackResult(
  url: string,
  error: string,
  fallbackImageData?: KarakeepImageFallback,
): OgResult {
  const domain = getDomainType(url);

  // Priority chain for image selection:
  // 1. Karakeep imageUrl (direct OG image)
  // 2. Karakeep imageAssetId (construct asset URL)
  // 3. Karakeep screenshotAssetId (construct screenshot URL)
  // 4. Domain fallback images
  let imageUrl: string | null = null;

  if (fallbackImageData) {
    // Try Karakeep imageUrl first (highest priority)
    if (fallbackImageData.imageUrl && isValidImageUrl(fallbackImageData.imageUrl)) {
      imageUrl = fallbackImageData.imageUrl;
      console.log(`[DataAccess/OpenGraph] Using Karakeep imageUrl fallback: ${imageUrl}`);

      // Schedule S3 persistence for Karakeep image
      scheduleImagePersistence(
        imageUrl,
        OPENGRAPH_IMAGES_S3_DIR,
        "Karakeep-Fallback",
        undefined,
        url,
      );
    }
    // Try Karakeep imageAssetId (second priority)
    else if (fallbackImageData.imageAssetId) {
      try {
        imageUrl = constructKarakeepAssetUrl(fallbackImageData.imageAssetId);
        console.log(`[DataAccess/OpenGraph] Using Karakeep imageAssetId fallback: ${imageUrl}`);

        // Schedule S3 persistence for Karakeep asset
        scheduleImagePersistence(
          imageUrl,
          OPENGRAPH_IMAGES_S3_DIR,
          "Karakeep-Asset-Fallback",
          fallbackImageData.imageAssetId,
          url,
        );
      } catch (error) {
        console.warn(
          `[DataAccess/OpenGraph] Failed to construct Karakeep asset URL for ${fallbackImageData.imageAssetId}:`,
          error,
        );
      }
    }
    // Try Karakeep screenshotAssetId (third priority)
    else if (fallbackImageData.screenshotAssetId) {
      try {
        imageUrl = constructKarakeepAssetUrl(fallbackImageData.screenshotAssetId);
        console.log(
          `[DataAccess/OpenGraph] Using Karakeep screenshotAssetId fallback: ${imageUrl}`,
        );

        // Schedule S3 persistence for Karakeep screenshot
        scheduleImagePersistence(
          imageUrl,
          OPENGRAPH_IMAGES_S3_DIR,
          "Karakeep-Screenshot-Fallback",
          fallbackImageData.screenshotAssetId,
          url,
        );
      } catch (error) {
        console.warn(
          `[DataAccess/OpenGraph] Failed to construct Karakeep screenshot URL for ${fallbackImageData.screenshotAssetId}:`,
          error,
        );
      }
    }
  }

  // Fall back to domain-specific defaults if no Karakeep data available
  if (!imageUrl) {
    imageUrl = getFallbackImageForDomain(domain);
  }

  return {
    imageUrl,
    bannerImageUrl: getFallbackBannerForDomain(domain),
    ogMetadata: {
      title: `Profile on ${domain}`,
      description: "Social media profile",
      site: domain,
      url: url,
    },
    error,
    timestamp: Date.now(),
    source: "fallback",
  };
}

/**
 * Gets fallback profile image for a domain
 * Returns absolute paths suitable for server-side use
 */
export function getFallbackImageForDomain(domain: string): string | null {
  switch (domain) {
    case SOCIAL_PLATFORMS.GITHUB:
      return (
        process.env.FALLBACK_IMAGE_GITHUB || "https://avatars.githubusercontent.com/u/99231285?v=4"
      );
    case SOCIAL_PLATFORMS.X:
    case SOCIAL_PLATFORMS.TWITTER:
      return (
        process.env.FALLBACK_IMAGE_X ||
        "https://pbs.twimg.com/profile_images/1515007138717503494/KUQNKo_M_400x400.jpg"
      );
    case SOCIAL_PLATFORMS.LINKEDIN:
      return (
        process.env.FALLBACK_IMAGE_LINKEDIN ||
        "https://media.licdn.com/dms/image/C5603AQGjv8C3WhrUfQ/profile-displayphoto-shrink_800_800/0/1651775977276"
      );
    case SOCIAL_PLATFORMS.DISCORD:
      return process.env.FALLBACK_IMAGE_DISCORD || "/images/william.jpeg";
    case SOCIAL_PLATFORMS.BLUESKY:
      return (
        process.env.FALLBACK_IMAGE_BLUESKY ||
        "https://cdn.bsky.app/img/avatar/plain/did:plc:o3rar2atqxlmczkaf6npbcqz/bafkreidpq75jyggvzlm5ddgpzhfkm4vprgitpxukqpgkrwr6sqx54b2oka@jpeg"
      );
    // Generic websites or unrecognised domains should show a generic OpenGraph card placeholder
    // to make it clear the image represents a link preview, not a personal/company avatar.
    default:
      return process.env.FALLBACK_IMAGE_OPENGRAPH || "/images/opengraph-placeholder.png";
  }
}

/**
 * Gets fallback banner image for a domain
 * Returns relative paths suitable for serving via API routes
 */
export function getFallbackBannerForDomain(domain: string): string | null {
  switch (domain) {
    case SOCIAL_PLATFORMS.GITHUB:
      return "/images/social-banners/github.svg";
    case SOCIAL_PLATFORMS.X:
    case SOCIAL_PLATFORMS.TWITTER:
      return "/images/social-banners/twitter-x.svg";
    case SOCIAL_PLATFORMS.LINKEDIN:
      return "/images/social-banners/linkedin.svg";
    case SOCIAL_PLATFORMS.DISCORD:
      return "/images/social-banners/discord.svg";
    case SOCIAL_PLATFORMS.BLUESKY:
      return "/images/social-banners/bluesky.png";
    default:
      return null;
  }
}

/**
 * Get domain-specific fallback image for the og-image route
 * Returns relative paths suitable for NextResponse.redirect
 */
export function getDomainFallbackImage(domain: string): string {
  switch (domain) {
    case SOCIAL_PLATFORMS.GITHUB:
      return "/images/william-github.jpg";
    case SOCIAL_PLATFORMS.X:
    case SOCIAL_PLATFORMS.TWITTER:
      return "/images/william-x.jpg";
    case SOCIAL_PLATFORMS.LINKEDIN:
      return "/images/william-linkedin.jpg";
    case SOCIAL_PLATFORMS.DISCORD:
      return "/images/william.jpeg";
    case SOCIAL_PLATFORMS.BLUESKY:
      return "/images/william-bluesky.jpg";
    default:
      return "/images/opengraph-placeholder.png";
  }
}

/**
 * Get appropriate fallback image based on context
 * Used by the og-image route for contextual fallbacks
 */
export function getContextualFallbackImage(input: string, error?: string): string {
  // For person/profile URLs, use person placeholder
  if (input.includes('/profile') || input.includes('/user') || input.includes('/people')) {
    return "/images/person-placeholder.png"; // Person placeholder
  }
  
  // For OpenGraph-specific failures or when we know it's an OG image request
  if (input.includes('og') || input.includes('opengraph') || error?.includes('opengraph')) {
    return "/images/opengraph-placeholder.png"; // OpenGraph card placeholder
  }
  
  // Default to generic OpenGraph card placeholder
  return "/images/opengraph-placeholder.png";
}