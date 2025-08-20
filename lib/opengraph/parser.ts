/**
 * OpenGraph HTML Parser Module
 *
 * Handles all HTML parsing and metadata extraction for OpenGraph
 * Contains platform-specific extraction logic
 * Optimized for large documents by extracting only the <head> section
 *
 * @module opengraph/parser
 */

import * as cheerio from "cheerio";
import { debug, debugWarn } from "@/lib/utils/debug";
import { getDomainType } from "@/lib/utils/opengraph-utils";
import { OPENGRAPH_FETCH_CONFIG } from "@/lib/constants";
import { isValidImageUrl, constructKarakeepAssetUrl } from "@/lib/utils/opengraph-utils";
import { karakeepImageFallbackSchema, type KarakeepImageFallback } from "@/types";
import { SOCIAL_PLATFORMS } from "@/types/social";
// OgMetadata type not needed in parser - only returns raw Record<string, string | null>

/**
 * Extracts OpenGraph tags from HTML content
 *
 * @param html - HTML content to parse
 * @param url - Source URL for context
 * @param fallbackImageData - Optional Karakeep fallback data for bookmarks
 * @returns Extracted metadata object
 */
export function extractOpenGraphTags(
  html: string,
  url: string,
  fallbackImageData?: KarakeepImageFallback,
): Record<string, string | null> {
  const htmlSizeBytes = Buffer.byteLength(html, "utf8");

  // Process HTML - create a new variable instead of reassigning parameter
  let processedHtml = html;

  // If HTML is too large, try to extract just the head section
  if (htmlSizeBytes > OPENGRAPH_FETCH_CONFIG.MAX_HTML_SIZE_BYTES) {
    debugWarn(
      `[DataAccess/OpenGraph] HTML content for ${url} is ${(htmlSizeBytes / (1024 * 1024)).toFixed(2)}MB. Attempting partial parse.`,
    );

    // Try to extract just the <head> section which should contain OpenGraph tags
    const headEndIndex = html.toLowerCase().indexOf("</head>");
    if (headEndIndex > 0 && headEndIndex < OPENGRAPH_FETCH_CONFIG.MAX_HTML_SIZE_BYTES) {
      // Parse just up to the end of head tag plus a buffer
      processedHtml = html.substring(0, headEndIndex + 7); // +7 for "</head>"
      debug(
        `[DataAccess/OpenGraph] Successfully extracted head section for parsing (${Buffer.byteLength(processedHtml, "utf8")} bytes)`,
      );
    } else {
      // If we can't find head or it's still too large, just take the first chunk
      processedHtml = html.substring(0, OPENGRAPH_FETCH_CONFIG.PARTIAL_HTML_SIZE);
      debugWarn(
        `[DataAccess/OpenGraph] Using first ${OPENGRAPH_FETCH_CONFIG.PARTIAL_HTML_SIZE / 1024}KB of HTML for ${url}. Full content was ${(htmlSizeBytes / (1024 * 1024)).toFixed(2)}MB.`,
      );
    }
  }

  const $ = cheerio.load(processedHtml);
  const domain = getDomainType(url);

  const getMetaContent = (selectors: string[]): string | null => {
    for (const selector of selectors) {
      const content = $(selector).attr("content");
      if (content) {
        // Decode HTML entities to prevent malformed URLs
        const decoded = $("<div>").html(content.trim()).text();
        return decoded;
      }
    }
    return null;
  };

  // Extract all possible image types with comprehensive coverage
  const result: Record<string, string | null> = {
    title:
      getMetaContent(['meta[property="og:title"]', 'meta[name="twitter:title"]']) ||
      $("title").first().text().trim() ||
      null,
    description: getMetaContent([
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
      'meta[name="description"]',
    ]),
    // Standard OpenGraph image
    image: getMetaContent(['meta[property="og:image"]']),
    // OpenGraph secure image (https variant)
    imageSecure: getMetaContent(['meta[property="og:image:secure_url"]']),
    // OpenGraph image URL (alternative property name)
    imageUrl: getMetaContent(['meta[property="og:image:url"]']),
    // Twitter card images
    twitterImage: getMetaContent(['meta[name="twitter:image"]', 'meta[name="twitter:image:src"]']),
    // Karakeep fallback images (for bookmarks)
    karakeepImage: null,
    karakeepAssetImage: null,
    karakeepScreenshotImage: null,
    // REMOVED: We should NEVER use favicons/icons as OpenGraph images
    // These fields were causing favicons to be fetched and stored
    // msapplicationImage: REMOVED - not a content image
    // schemaImage: REMOVED - often just a logo
    // appleTouchIcon: REMOVED - this is a favicon, not content
    // icon: REMOVED - this is definitely just a favicon

    site: getMetaContent(['meta[property="og:site_name"]', 'meta[name="twitter:site"]']),
    type: getMetaContent(['meta[property="og:type"]']),
    url: getMetaContent(['meta[property="og:url"]']) || url,
    siteName: getMetaContent(['meta[property="og:site_name"]']),

    // Platform-specific extraction
    profileImage: null,
    bannerImage: null,
  };

  // Platform-specific image extraction
  try {
    if (domain === SOCIAL_PLATFORMS.GITHUB) {
      result.profileImage = extractGitHubProfileImage($);
    } else if (domain === SOCIAL_PLATFORMS.X || domain === SOCIAL_PLATFORMS.TWITTER) {
      const twitterImages = extractTwitterImages($);
      result.profileImage = twitterImages.profile;
      result.bannerImage = twitterImages.banner;
    } else if (domain === SOCIAL_PLATFORMS.LINKEDIN) {
      const linkedinImages = extractLinkedInImages($);
      result.profileImage = linkedinImages.profile;
      result.bannerImage = linkedinImages.banner;
    } else if (domain === SOCIAL_PLATFORMS.BLUESKY) {
      result.profileImage = extractBlueskyProfileImage($);
    }
  } catch (error) {
    debugWarn(`[DataAccess/OpenGraph] Error during platform-specific extraction for ${domain}:`, error);
  }

  // Add Karakeep fallback images if provided (for bookmarks)
  // Validate fallback image data before use
  const validatedFallbackData = fallbackImageData
    ? karakeepImageFallbackSchema.safeParse(fallbackImageData).success
      ? karakeepImageFallbackSchema.parse(fallbackImageData)
      : undefined
    : undefined;

  if (validatedFallbackData) {
    if (validatedFallbackData.imageUrl && isValidImageUrl(validatedFallbackData.imageUrl)) {
      result.karakeepImage = validatedFallbackData.imageUrl;
    }
    if (validatedFallbackData.imageAssetId) {
      try {
        result.karakeepAssetImage = constructKarakeepAssetUrl(validatedFallbackData.imageAssetId);
      } catch {
        // Silently ignore invalid asset IDs
      }
    }
    if (validatedFallbackData.screenshotAssetId) {
      try {
        result.karakeepScreenshotImage = constructKarakeepAssetUrl(validatedFallbackData.screenshotAssetId);
      } catch {
        // Silently ignore invalid asset IDs
      }
    }
  }

  return result;
}

/**
 * Platform-specific image extraction functions using Cheerio
 */
export function extractGitHubProfileImage($: cheerio.CheerioAPI): string | null {
  // Common selectors for GitHub profile pictures, ordered by specificity
  const selectors = [
    "img.avatar-user", // Most specific selector for user profile pages
    "img.avatar", // Standard avatar class
    'img[alt*="avatar"]', // Alt text containing "avatar"
    'a[itemprop="image"] img', // Schema.org itemprop
    'meta[property="og:image"]', // Fallback to OG image if specific avatar not found
    'meta[name="twitter:image"]',
  ];

  for (const selector of selectors) {
    const el = $(selector).first();
    const src = el.attr("src") || el.attr("content");
    if (src) return src.trim();
  }
  return null;
}

export function extractTwitterImages($: cheerio.CheerioAPI): {
  profile: string | null;
  banner: string | null;
} {
  let profile: string | null = null;
  let banner: string | null = null;

  // Profile image selectors (these can be very volatile due to Twitter's obfuscated classes)
  // Prioritize more stable attributes if possible
  const profileSelectors = [
    'a[href$="/photo"] img[src*="profile_images"]', // Link to profile photo page containing an image from profile_images
    'img[alt*="Profile image"][src*="profile_images"]',
    'img[data-testid="UserAvatar-Container"] img[src*="profile_images"]', // Test IDs can change
  ];
  for (const selector of profileSelectors) {
    const el = $(selector).first();
    if (el.length) {
      profile = el.attr("src")?.trim() || null;
      if (profile) break;
    }
  }
  // Fallback to general OG/Twitter image if specific profile image not found
  if (!profile) {
    profile =
      $('meta[property="og:image"]').attr("content")?.trim() ||
      $('meta[name="twitter:image"]').attr("content")?.trim() ||
      null;
  }

  // Banner image selectors
  const bannerSelectors = [
    'a[href$="/header_photo"] img', // Link to header photo page
    'div[data-testid="UserProfileHeader_Banner"] img',
  ];
  for (const selector of bannerSelectors) {
    const el = $(selector).first();
    if (el.length) {
      banner = el.attr("src")?.trim() || null;
      if (banner) break;
    }
  }
  // Fallback for banner (less common in meta tags, but worth a check)
  if (!banner) {
    // Twitter card images sometimes serve as banners if type is summary_large_image
    if ($('meta[name="twitter:card"]').attr("content") === "summary_large_image") {
      banner = $('meta[name="twitter:image"]').attr("content")?.trim() || null;
      // If this banner is the same as profile, nullify banner to avoid duplication
      if (banner && banner === profile) {
        banner = null;
      }
    }
  }
  return { profile, banner };
}

export function extractLinkedInImages($: cheerio.CheerioAPI): {
  profile: string | null;
  banner: string | null;
} {
  let profile: string | null = null;
  let banner: string | null = null;

  // Profile image selectors
  const profileSelectors = [
    "img.profile-photo-edit__preview", // Edit profile view
    "img.pv-top-card-profile-picture__image", // Public profile view
    "section.profile-photo-edit img", // Another potential selector
    'meta[property="og:image"]', // OG image often is the profile pic
  ];
  for (const selector of profileSelectors) {
    const el = $(selector).first();
    if (el.length) {
      profile = el.attr("src")?.trim() || el.attr("content")?.trim() || null;
      if (profile) break;
    }
  }

  // Banner image selectors
  // LinkedIn banners are often background images on divs
  const bannerElement = $("div.profile-top-card__banner").first();
  if (bannerElement.length) {
    const style = bannerElement.attr("style");
    if (style) {
      // Use optional chaining for match as style could be undefined, though `if (style)` checks this.
      // More importantly, style.match itself could return null.
      const match = style.match(/background-image:\s*url\((['"]?)(.*?)\1\)/);
      if (match?.[2]) {
        // Check if match and match[2] are not null/undefined
        banner = match[2];
      }
    }
  }
  // Fallback if not found as background image
  if (!banner) {
    const bannerImg = $("img.profile-banner-image__image").first();
    if (bannerImg.length) {
      banner = bannerImg.attr("src")?.trim() || null;
    }
  }

  return { profile, banner };
}

export function extractBlueskyProfileImage($: cheerio.CheerioAPI): string | null {
  // Bluesky profile images are often in meta tags or specific img tags
  const selectors = [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    'img[alt*="avatar"][src*="cdn.bsky.app/img/avatar"]',
    'img[src*="cdn.bsky.app/img/avatar/plain/"]', // More specific avatar URL pattern
  ];
  for (const selector of selectors) {
    const el = $(selector).first();
    const src = el.attr("src") || el.attr("content");
    if (src) return src.trim();
  }
  return null;
}
