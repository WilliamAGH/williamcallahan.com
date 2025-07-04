/**
 * OpenGraph Fallback Module
 *
 * Unified fallback logic for OpenGraph images and metadata
 * Single source of truth for all fallback handling
 *
 * @module opengraph/fallback
 */

// debug import removed - using console.log for fallback logging
import { getDomainType, isValidImageUrl } from "@/lib/utils/opengraph-utils";
import { getBaseUrl } from "@/lib/utils/get-base-url";
import type { OgResult, KarakeepImageFallback } from "@/types";
import { karakeepImageFallbackSchema } from "@/types/seo/opengraph";
import { SOCIAL_PLATFORMS } from "@/types/social";
import { getStaticImageUrl } from "@/lib/data-access/static-images";

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
  fallbackImageData?: KarakeepImageFallback | null,
): OgResult {
  // Validate fallback image data if provided
  const validatedFallbackData = fallbackImageData
    ? karakeepImageFallbackSchema.safeParse(fallbackImageData).data
    : undefined;
  const domain = getDomainType(url);

  // Priority chain for image selection:
  // 5. Karakeep imageUrl (direct OG image)
  // 6. Karakeep imageAssetId (construct asset URL)
  // 7. Karakeep screenshotAssetId (construct screenshot URL)
  // 8. Domain fallback images
  let imageUrl: string | null = null;

  if (validatedFallbackData) {
    console.log(`[OG-Fallback] 📋 Found Karakeep fallback data for: ${url}`);

    // PRIORITY LEVEL 5: Try Karakeep imageUrl first (highest priority)
    const karakeepImageUrl = String(validatedFallbackData.imageUrl ?? "not found");
    console.log(`[OG-Priority-5] 🔍 Checking Karakeep imageUrl: ${karakeepImageUrl}`);
    if (validatedFallbackData.imageUrl && isValidImageUrl(validatedFallbackData.imageUrl)) {
      imageUrl = validatedFallbackData.imageUrl;
      console.log(`[OG-Priority-5] ✅ Using Karakeep imageUrl: ${imageUrl}`);

      // No persistence during runtime - only during data-updater runs
    } else {
      console.log(`[OG-Priority-5] ❌ Karakeep imageUrl not valid or not found`);
    }

    // PRIORITY LEVEL 6: Try Karakeep imageAssetId (second priority)
    if (!imageUrl && validatedFallbackData.imageAssetId) {
      const assetId = validatedFallbackData.imageAssetId;
      console.log(`[OG-Priority-6] 🔍 Checking Karakeep imageAssetId: ${assetId}`);
      try {
        const baseUrl = getBaseUrl();
        if (baseUrl) {
          const assetUrl = new URL(`/api/assets/${assetId}`, baseUrl).toString();
          if (isValidImageUrl(assetUrl)) {
            imageUrl = assetUrl;
            console.log(`[OG-Priority-6] ✅ Using Karakeep imageAssetId, constructed URL: ${imageUrl}`);

            // No persistence during runtime - only during data-updater runs
          }
        }
      } catch (error) {
        console.error(`[OG-Fallback] Error constructing URL for assetId ${assetId}: ${String(error)}`);
      }
    } else if (!imageUrl) {
      console.log(`[OG-Priority-6] ❌ Karakeep imageAssetId not found`);
    }

    // PRIORITY LEVEL 7: Try Karakeep screenshotAssetId (third priority)
    if (!imageUrl && validatedFallbackData.screenshotAssetId) {
      const screenshotAssetId = validatedFallbackData.screenshotAssetId;
      console.log(`[OG-Priority-7] 🔍 Checking Karakeep screenshotAssetId: ${screenshotAssetId}`);
      try {
        const baseUrl = getBaseUrl();
        if (baseUrl) {
          const screenshotUrl = new URL(`/api/assets/${screenshotAssetId}`, baseUrl).toString();
          if (isValidImageUrl(screenshotUrl)) {
            imageUrl = screenshotUrl;
            console.log(`[OG-Priority-7] ✅ Using Karakeep screenshot, constructed URL: ${imageUrl}`);

            // No persistence during runtime - only during data-updater runs
          }
        }
      } catch (error) {
        console.error(
          `[OG-Fallback] Error constructing URL for screenshotAssetId ${screenshotAssetId}: ${String(error)}`,
        );
      }
    } else if (!imageUrl) {
      console.log(`[OG-Priority-7] ❌ Karakeep screenshotAssetId not found`);
    }
  } else {
    console.log(`[OG-Fallback] ❌ No Karakeep fallback data available for: ${url}`);
  }

  // PRIORITY LEVEL 8: Fall back to domain-specific defaults if no Karakeep data worked
  if (!imageUrl) {
    console.log(`[OG-Priority-8] 🔍 Checking domain-specific fallback for domain: ${domain}`);
    imageUrl = getFallbackImageForDomain(domain);
    if (imageUrl) {
      console.log(`[OG-Priority-8] ✅ Using domain-specific fallback: ${imageUrl}`);
    } else {
      console.log(`[OG-Priority-8] ❌ No domain-specific fallback available for: ${domain}`);
    }
  }

  return {
    url,
    title: "Fallback Data",
    description: `Could not retrieve OpenGraph data: ${error}`,
    imageUrl,
    bannerImageUrl: getFallbackBannerForDomain(domain),
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
      return process.env.FALLBACK_IMAGE_GITHUB || "https://avatars.githubusercontent.com/u/99231285?v=4";
    case SOCIAL_PLATFORMS.X:
    case SOCIAL_PLATFORMS.TWITTER:
      return (
        process.env.FALLBACK_IMAGE_X || "https://pbs.twimg.com/profile_images/1515007138717503494/KUQNKo_M_400x400.jpg"
      );
    case SOCIAL_PLATFORMS.LINKEDIN:
      return (
        process.env.FALLBACK_IMAGE_LINKEDIN ||
        "https://media.licdn.com/dms/image/C5603AQGjv8C3WhrUfQ/profile-displayphoto-shrink_800_800/0/1651775977276"
      );
    case SOCIAL_PLATFORMS.DISCORD:
      return process.env.FALLBACK_IMAGE_DISCORD || getStaticImageUrl("/images/william.jpeg");
    case SOCIAL_PLATFORMS.BLUESKY:
      return (
        process.env.FALLBACK_IMAGE_BLUESKY ||
        "https://cdn.bsky.app/img/avatar/plain/did:plc:o3rar2atqxlmczkaf6npbcqz/bafkreidpq75jyggvzlm5ddgpzhfkm4vprgitpxukqpgkrwr6sqx54b2oka@jpeg"
      );
    // Generic websites or unrecognized domains should show a generic OpenGraph card placeholder
    // to make it clear the image represents a link preview, not a personal/company avatar.
    default:
      return process.env.FALLBACK_IMAGE_OPENGRAPH || getStaticImageUrl("/images/opengraph-placeholder.png");
  }
}

/**
 * Gets fallback banner image for a domain
 * Returns relative paths suitable for serving via API routes
 */
export function getFallbackBannerForDomain(domain: string): string | null {
  switch (domain) {
    case SOCIAL_PLATFORMS.GITHUB:
      return getStaticImageUrl("/images/social-banners/github.svg");
    case SOCIAL_PLATFORMS.X:
    case SOCIAL_PLATFORMS.TWITTER:
      return getStaticImageUrl("/images/social-banners/twitter-x.svg");
    case SOCIAL_PLATFORMS.LINKEDIN:
      return getStaticImageUrl("/images/social-banners/linkedin.svg");
    case SOCIAL_PLATFORMS.DISCORD:
      return getStaticImageUrl("/images/social-banners/discord.svg");
    case SOCIAL_PLATFORMS.BLUESKY:
      return getStaticImageUrl("/images/social-banners/bluesky.png");
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
      return getStaticImageUrl("/images/social-pics/github.jpg");
    case SOCIAL_PLATFORMS.X:
    case SOCIAL_PLATFORMS.TWITTER:
      return getStaticImageUrl("/images/social-pics/x.jpg");
    case SOCIAL_PLATFORMS.LINKEDIN:
      return getStaticImageUrl("/images/social-pics/linkedin.jpg");
    case SOCIAL_PLATFORMS.DISCORD:
      return getStaticImageUrl("/images/social-pics/discord.jpg");
    case SOCIAL_PLATFORMS.BLUESKY:
      return getStaticImageUrl("/images/social-pics/bluesky.jpg");
    default:
      return getStaticImageUrl("/images/opengraph-placeholder.png");
  }
}

/**
 * Get appropriate fallback image based on context
 * Used by the og-image route for contextual fallbacks
 */
export function getContextualFallbackImage(input: string, error?: string): string {
  // For person/profile URLs, use person placeholder
  if (input.includes("/profile") || input.includes("/user") || input.includes("/people")) {
    return getStaticImageUrl("/images/person-placeholder.png"); // Person placeholder
  }

  // For OpenGraph-specific failures or when we know it's an OG image request
  if (input.includes("og") || input.includes("opengraph") || error?.includes("opengraph")) {
    return getStaticImageUrl("/images/opengraph-placeholder.png"); // OpenGraph card placeholder
  }

  // Default to generic OpenGraph card placeholder
  return getStaticImageUrl("/images/opengraph-placeholder.png");
}
