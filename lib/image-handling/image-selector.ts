/**
 * OpenGraph Image Selector Module
 *
 * Handles selection of the best available image from extracted metadata
 * Implements priority-based selection logic
 *
 * @module opengraph/imageSelector
 */

import { debug, debugWarn } from "@/lib/utils/debug";
import { isValidImageUrl, getDomainType } from "@/lib/utils/opengraph-utils";

/**
 * Selects the best available image from extracted metadata based on priority order
 *
 * Priority order (highest to lowest):
 * 1. Platform-specific profile image (most relevant for social profiles)
 * 2. Standard og:image (most common and reliable)
 * 3. og:image:secure_url (HTTPS variant)
 * 4. og:image:url (alternative property)
 * 5. twitter:image (Twitter card image)
 * 6. Karakeep images (for bookmarks): karakeepImage, karakeepAssetImage, karakeepScreenshotImage
 * 7. Schema.org image
 * 8. MS Application tile image
 * 9. Apple touch icon (usually high quality)
 * 10. Standard favicon/icon (last resort)
 *
 * @param metadata - Sanitized metadata object
 * @param url - Optional URL for domain type detection
 * @returns The best available image URL or null
 */
export function selectBestOpenGraphImage(metadata: Record<string, unknown>, url?: string): string | null {
  // Determine if this is a social media platform
  const domainType = url ? getDomainType(url) : "Website";
  const isSocialPlatform = ["GitHub", "X", "LinkedIn", "Bluesky"].includes(domainType);

  // Define priority order
  const imagePriority = [
    "profileImage", // Platform-specific (GitHub, Twitter, LinkedIn profile pics)
    "image", // Standard og:image
    "imageSecure", // og:image:secure_url
    "imageUrl", // og:image:url
    "twitterImage", // Twitter card image
    "karakeepImage", // Karakeep direct image URL
    "karakeepAssetImage", // Karakeep asset-based image
    "karakeepScreenshotImage", // Karakeep screenshot
    "schemaImage", // Schema.org image
    "msapplicationImage", // MS tile image
    "appleTouchIcon", // Apple touch icon
    "icon", // Regular favicon
  ];

  // Try each image type in priority order
  for (const imageKey of imagePriority) {
    const imageUrl = metadata[imageKey];
    const imageUrlString = typeof imageUrl === "string" ? imageUrl : "not found";
    
    // Special handling for profileImage on non-social sites
    if (imageKey === "profileImage" && !isSocialPlatform) {
      debug(`[OG-Priority-4.${imageKey}] Skipping profileImage check for non-social site (${domainType})`);
      continue;
    }
    
    console.log(`[OG-Priority-4.${imageKey}] 🔍 Checking ${imageKey}: ${imageUrlString}`);

    // Skip if undefined, null, or not a valid string
    if (typeof imageUrl !== "string" || !imageUrl) {
      const typeInfo = typeof imageUrl;
      console.log(`[OG-Priority-4.${imageKey}] ❌ ${imageKey} not valid: ${typeInfo} - ${imageUrlString}`);
      continue;
    }

    if (isValidImageUrl(imageUrl)) {
      // Handle relative URLs
      if (imageUrl.startsWith("/") || imageUrl.startsWith("./")) {
        try {
          // Always use the public site URL as the base for resolving relative image paths
          // This prevents local/internal URLs (e.g., http://localhost:3000) from being used in production
          const publicSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
          if (!publicSiteUrl) {
            debugWarn(
              `[DataAccess/OpenGraph] NEXT_PUBLIC_SITE_URL is not set. Cannot resolve relative image URL: ${imageUrl}`,
            );
            continue;
          }
          const baseUrl = new URL(publicSiteUrl);
          const absoluteUrl = new URL(imageUrl, baseUrl).toString();
          console.log(
            `[OG-Priority-4.${imageKey}] ✅ Resolved relative ${imageKey} URL: ${imageUrl} -> ${absoluteUrl}`,
          );
          return absoluteUrl;
        } catch (e) {
          debugWarn(
            `[DataAccess/OpenGraph] Failed to resolve relative URL for ${imageKey}: ${imageUrl} with error: ${e instanceof Error ? e.message : String(e)}`,
          );
          continue;
        }
      }

      console.log(`[OG-Priority-4.${imageKey}] ✅ Selected ${imageKey} as best image: ${imageUrl}`);
      return imageUrl;
    } else {
      // At this point imageUrl is definitely a string (we checked above), but isValidImageUrl returned false
      console.log(`[OG-Priority-4.${imageKey}] ❌ ${imageKey} URL not valid: ${String(imageUrl)}`);
    }
  }

  // Log which image types were checked but invalid/missing
  const checkedTypes: string[] = [];
  for (const key of imagePriority) {
    const value = metadata[key];
    if (value && typeof value === "string") {
      const stringValue: string = value;
      checkedTypes.push(`${key}="${stringValue}"`);
    }
  }
  const checkedTypesStr = checkedTypes.join(", ");

  if (checkedTypesStr.length > 0) {
    debug(`[DataAccess/OpenGraph] No valid image found. Checked: ${checkedTypesStr}`);
  } else {
    debug("[DataAccess/OpenGraph] No image metadata found in any standard location");
  }

  return null;
}
