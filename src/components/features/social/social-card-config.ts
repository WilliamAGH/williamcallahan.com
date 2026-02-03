/**
 * Social Card Platform Configuration
 * @module components/features/social/social-card-config
 * @description
 * Configuration constants and helper functions for social platform detection,
 * styling, and image paths. Extracted to keep the main component under 350 lines.
 */

/** Delay before mounting to allow for smooth transition animations */
export const MOUNT_DELAY_MS = 20;

/** Default GitHub username for avatar fallback when extraction fails */
export const DEFAULT_GITHUB_USERNAME = "WilliamAGH";

/** Width in pixels for profile images (used for srcset generation) */
export const PROFILE_IMAGE_WIDTH_PX = 64;

/** Brand accent colors for social platforms (hex + RGB for CSS variables) */
const SOCIAL_ACCENT_COLORS: Record<string, { accentHex: string; accentRgb: string }> = {
  linkedin: { accentHex: "#0a66c2", accentRgb: "10 102 194" },
  github: { accentHex: "#6e5494", accentRgb: "110 84 148" },
  twitter: { accentHex: "#1da1f2", accentRgb: "29 161 242" },
  bluesky: { accentHex: "#0099ff", accentRgb: "0 153 255" },
  discord: { accentHex: "#7289da", accentRgb: "114 137 218" },
};

const DEFAULT_ACCENT = { accentHex: "#3b82f6", accentRgb: "59 130 246" }; // blue-500

/** Keywords that map to each social platform */
export const SOCIAL_PLATFORM_KEYWORDS: Record<string, string[]> = {
  linkedin: ["linkedin"],
  github: ["github"],
  twitter: ["x", "twitter", "x.com"],
  bluesky: ["bluesky", "bsky"],
  discord: ["discord"],
};

/** Base path for social media CDN assets (single source of truth) */
const SOCIAL_MEDIA_CDN_BASE = "images/social-media";

/** Profile image filenames by platform */
const PROFILE_IMAGE_FILES: Record<string, string> = {
  twitter: "x_5469c2d0.jpg",
  linkedin: "linkedin_cd280279.jpg",
  bluesky: "bluesky_5a093069.jpg",
  discord: "discord_5a093069.jpg",
  github: "github_72193247.jpg",
};

/** Banner image filenames by platform */
const BANNER_IMAGE_FILES: Record<string, string> = {
  github: "github_87b6d92e.svg",
  twitter: "twitter-x_4830ec25.svg",
  linkedin: "linkedin_02a7ce76.svg",
  discord: "discord_783c1e2b.svg",
  bluesky: "bluesky_9310c7f9.png",
};

/** Profile image paths by platform (CDN-relative) - derived from base + filename */
export const PROFILE_IMAGE_PATHS: Record<string, string> = Object.fromEntries(
  Object.entries(PROFILE_IMAGE_FILES).map(([k, v]) => [
    k,
    `${SOCIAL_MEDIA_CDN_BASE}/profiles/${v}`,
  ]),
);

/** Banner image paths by platform (CDN-relative) - derived from base + filename */
export const BANNER_IMAGE_PATHS: Record<string, string> = Object.fromEntries(
  Object.entries(BANNER_IMAGE_FILES).map(([k, v]) => [k, `${SOCIAL_MEDIA_CDN_BASE}/banners/${v}`]),
);

/** CSS class names for brand styling */
export const CARD_BRAND_CLASSES: Record<string, string> = {
  linkedin: "linkedin-card",
  github: "github-card",
  twitter: "twitter-card",
  bluesky: "bluesky-card",
  discord: "discord-card",
};

/** Default profile image CDN path */
export const DEFAULT_PROFILE_IMAGE = "images/other/profile/william_5469c2d0.jpg";

/** Default banner placeholder CDN path */
export const DEFAULT_BANNER_IMAGE = "images/other/placeholders/company_90296cb3.svg";

/**
 * Detects the social platform by searching for keywords in combined text.
 * @param displayLabel - User-facing label text (e.g., "GitHub (@user)")
 * @param hostname - URL hostname (e.g., "github.com", "x.com")
 * @returns Platform key (e.g., "github", "twitter") or null if not detected
 */
export function detectSocialPlatform(displayLabel: string, hostname: string): string | null {
  const searchText = `${displayLabel} ${hostname}`.toLowerCase();
  for (const [platform, keywords] of Object.entries(SOCIAL_PLATFORM_KEYWORDS)) {
    if (keywords.some((keyword) => searchText.includes(keyword))) {
      return platform;
    }
  }
  return null;
}

/**
 * Resolves brand accent colors for a social platform.
 * @param displayLabel - User-facing label text
 * @param hostname - URL hostname
 */
export function getSocialAccentColors(
  displayLabel: string,
  hostname: string,
): { accentHex: string; accentRgb: string } {
  const platform = detectSocialPlatform(displayLabel, hostname);
  return platform ? (SOCIAL_ACCENT_COLORS[platform] ?? DEFAULT_ACCENT) : DEFAULT_ACCENT;
}

/**
 * Handle extraction rules by platform.
 * Each platform specifies how to extract the user handle from URL path segments.
 */
const HANDLE_EXTRACTORS: Record<string, (pathParts: string[]) => string> = {
  github: (parts) => `@${parts[0] ?? ""}`,
  twitter: (parts) => `@${parts[0] ?? ""}`,
  bluesky: (parts) => `@${parts[1] ?? ""}`,
  linkedin: (parts) => (parts[1] ? `/${parts[0]}/${parts[1]}` : `/${parts[0] ?? ""}`),
  discord: () => "Community",
};

/** Extracts a user handle from a social media URL using platform-specific rules */
export function getUserHandle(url: string): string {
  if (!url) return "";
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/").filter(Boolean);
    const platform = detectSocialPlatform("", urlObj.hostname);

    if (platform && HANDLE_EXTRACTORS[platform]) {
      return HANDLE_EXTRACTORS[platform](pathParts);
    }
  } catch {
    // Invalid URL - extract last path segment as fallback
    const parts = url.split("/").filter(Boolean);
    return parts.pop() ?? "";
  }
  return "Profile";
}
