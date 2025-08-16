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
 * Base64 data URL for company placeholder to prevent broken image flash
 * This is an inline version of /images/company-placeholder.svg
 */
export const COMPANY_PLACEHOLDER_BASE64 =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj4KICA8ZGVmcz4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iY2lyY2xlR3JhZGllbnQiIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPgogICAgICA8c3RvcCBvZmZzZXQ9IjAlIiBzdHlsZT0ic3RvcC1jb2xvcjojZjhmOWZhO3N0b3Atb3BhY2l0eTowLjk1Ii8+CiAgICAgIDxzdG9wIG9mZnNldD0iMTAwJSIgc3R5bGU9InN0b3AtY29sb3I6I2U5ZWNlZjtzdG9wLW9wYWNpdHk6MC45NSIvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iYnVpbGRpbmdHcmFkaWVudCIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMCUiPgogICAgICA8c3RvcCBvZmZzZXQ9IjAlIiBzdHlsZT0ic3RvcC1jb2xvcjojMmIzMTM3Ii8+CiAgICAgIDxzdG9wIG9mZnNldD0iMTAwJSIgc3R5bGU9InN0b3AtY29sb3I6IzM3M2Q0NCIvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0id2luZG93R3JhZGllbnQiIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMCUiIHkyPSIxMDAlIj4KICAgICAgPHN0b3Agb2Zmc2V0PSIwJSIgc3R5bGU9InN0b3AtY29sb3I6I2E4ZDhmZiIvPgogICAgICA8c3RvcCBvZmZzZXQ9IjEwMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiM3NWI2ZmYiLz4KICAgIDwvbGluZWFyR3JhZGllbnQ+CiAgPC9kZWZzPgoKICA8IS0tIEJhY2tncm91bmQgY2lyY2xlIC0tPgogIDxjaXJjbGUgY3g9IjUwIiBjeT0iNTAiIHI9IjQ4IiBmaWxsPSJ1cmwoI2NpcmNsZUdyYWRpZW50KSIgc3Ryb2tlPSIjZGVlMmU2IiBzdHJva2Utd2lkdGg9IjEuNSIvPgoKICA8IS0tIEJ1aWxkaW5nIGNvbXBsZXggLSBwcm9wZXJseSBjZW50ZXJlZCAtLT4KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyNy41LCAxMCkiPgogICAgPCEtLSBNYWluIHRvd2VyIC0tPgogICAgPHBhdGggZD0iTTE1IDEwIEwzNSAxMCBMMzUgNzUgTDE1IDc1IFoiIGZpbGw9InVybCgjYnVpbGRpbmdHcmFkaWVudCkiLz4KCiAgICA8IS0tIFNlY29uZGFyeSB0b3dlciAtLT4KICAgIDxwYXRoIGQ9Ik0wIDIyIEwxNSAyMiBMMTUgNzUgTDAgNzUgWiIgZmlsbD0idXJsKCNidWlsZGluZ0dyYWRpZW50KSIvPgoKICAgIDwhLS0gQ29ubmVjdGluZyBzZWN0aW9uIC0tPgogICAgPHBhdGggZD0iTTM1IDMwIEw0NSAzMCBMNDUgNzUgTDM1IDc1IFoiIGZpbGw9InVybCgjYnVpbGRpbmdHcmFkaWVudCkiLz4KCiAgICA8IS0tIEFyY2hpdGVjdHVyYWwgZGV0YWlscyAtIE1haW4gdG93ZXIgLS0+CiAgICA8cmVjdCB4PSIxNyIgeT0iMTUiIHdpZHRoPSIxNiIgaGVpZ2h0PSIzIiBmaWxsPSIjNGE1MjVhIi8+CiAgICA8cmVjdCB4PSIxNyIgeT0iMjQiIHdpZHRoPSIxNiIgaGVpZ2h0PSIzIiBmaWxsPSIjNGE1MjVhIi8+CiAgICA8cmVjdCB4PSIxNyIgeT0iMzMiIHdpZHRoPSIxNiIgaGVpZ2h0PSIzIiBmaWxsPSIjNGE1MjVhIi8+CiAgICA8cmVjdCB4PSIxNyIgeT0iNDIiIHdpZHRoPSIxNiIgaGVpZ2h0PSIzIiBmaWxsPSIjNGE1MjVhIi8+CiAgICA8cmVjdCB4PSIxNyIgeT0iNTEiIHdpZHRoPSIxNiIgaGVpZ2h0PSIzIiBmaWxsPSIjNGE1MjVhIi8+CiAgICA8cmVjdCB4PSIxNyIgeT0iNjAiIHdpZHRoPSIxNiIgaGVpZ2h0PSIzIiBmaWxsPSIjNGE1MjVhIi8+CgogICAgPCEtLSBXaW5kb3dzIC0gU2Vjb25kYXJ5IHRvd2VyIC0tPgogICAgPHJlY3QgeD0iMiIgeT0iMjgiIHdpZHRoPSIxMSIgaGVpZ2h0PSIxMyIgZmlsbD0idXJsKCN3aW5kb3dHcmFkaWVudCkiIG9wYWNpdHk9IjAuOSIvPgogICAgPHJlY3QgeD0iMiIgeT0iNDYiIHdpZHRoPSIxMSIgaGVpZ2h0PSIxMyIgZmlsbD0idXJsKCN3aW5kb3dHcmFkaWVudCkiIG9wYWNpdHk9IjAuOSIvPgoKICAgIDwhLS0gV2luZG93cyAtIENvbm5lY3Rpbmcgc2VjdGlvbiAtLT4KICAgIDxyZWN0IHg9IjM3IiB5PSIzNSIgd2lkdGg9IjYiIGhlaWdodD0iMTAiIGZpbGw9InVybCgjd2luZG93R3JhZGllbnQpIiBvcGFjaXR5PSIwLjkiLz4KICAgIDxyZWN0IHg9IjM3IiB5PSI1MCIgd2lkdGg9IjYiIGhlaWdodD0iMTAiIGZpbGw9InVybCgjd2luZG93R3JhZGllbnQpIiBvcGFjaXR5PSIwLjkiLz4KCiAgICA8IS0tIFJvb2Z0b3AgZGV0YWlscyAtLT4KICAgIDxwYXRoIGQ9Ik0xNSAxMCBMMjUgMyBMMzUgMTAiIGZpbGw9IiMyYjMxMzciLz4KICAgIDxyZWN0IHg9IjI0IiB5PSI1IiB3aWR0aD0iMiIgaGVpZ2h0PSI1IiBmaWxsPSIjNGE1MjVhIi8+CgogICAgPCEtLSBHcm91bmQgZmxvb3IgZGV0YWlscyAtLT4KICAgIDxwYXRoIGQ9Ik0wIDc1IEw0NSA3NSBMNDMgNzkgTDIgNzkgWiIgZmlsbD0iIzIzMjMyMyIvPgoKICAgIDwhLS0gRW50cmFuY2UgLS0+CiAgICA8cmVjdCB4PSIyMiIgeT0iNjUiIHdpZHRoPSI2IiBoZWlnaHQ9IjEwIiBmaWxsPSIjNGE1MjVhIi8+CiAgICA8cmVjdCB4PSIyMyIgeT0iNjYiIHdpZHRoPSI0IiBoZWlnaHQ9IjkiIGZpbGw9InVybCgjd2luZG93R3JhZGllbnQpIiBvcGFjaXR5PSIwLjciLz4KICA8L2c+Cjwvc3ZnPg==";

/**
 * Get the company placeholder image URL
 */
export function getCompanyPlaceholder(): string {
  return getPlaceholderImageUrl(PLACEHOLDER_IMAGES.COMPANY_PLACEHOLDER);
}
