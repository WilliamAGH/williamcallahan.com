/**
 * OpenGraph Image Selector Module
 *
 * Handles selection of the best available image from extracted metadata
 * Implements priority-based selection logic
 *
 * @module opengraph/imageSelector
 */

import { debug, debugWarn } from "@/lib/utils/debug";
import { isValidImageUrl } from "@/lib/utils/opengraph-utils";

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
 * @param pageUrl - The page URL for resolving relative URLs
 * @returns The best available image URL or null
 */
export function selectBestOpenGraphImage(metadata: Record<string, unknown>, pageUrl: string): string | null {
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
    // Skip if undefined, null, or not a valid string
    if (typeof imageUrl !== "string" || !imageUrl) {
      continue;
    }

    if (isValidImageUrl(imageUrl)) {
      // Handle relative URLs
      if (imageUrl.startsWith("/") || imageUrl.startsWith("./")) {
        try {
          const baseUrl = new URL(pageUrl);
          const absoluteUrl = new URL(imageUrl, baseUrl).toString();
          debug(`[DataAccess/OpenGraph] Resolved relative ${imageKey} URL: ${imageUrl} -> ${absoluteUrl}`);
          return absoluteUrl;
        } catch {
          debugWarn(`[DataAccess/OpenGraph] Failed to resolve relative URL for ${imageKey}: ${imageUrl}`);
          continue;
        }
      }

      debug(`[DataAccess/OpenGraph] Selected ${imageKey} as best image: ${imageUrl}`);
      return imageUrl;
    }
  }

  // Log which image types were checked but invalid/missing
  const checkedTypes = imagePriority
    .filter((key) => metadata[key] && typeof metadata[key] === "string")
    .map((key) => `${key}="${metadata[key] as string}"`)
    .join(", ");

  if (checkedTypes) {
    debug(`[DataAccess/OpenGraph] No valid image found. Checked: ${checkedTypes}`);
  } else {
    debug("[DataAccess/OpenGraph] No image metadata found in any standard location");
  }

  return null;
}
