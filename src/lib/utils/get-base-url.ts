/**
 * Utility to get the base URL for API calls.
 * Returns an empty string for client-side calls (allowing relative paths)
 * and an absolute URL for server-side calls.
 */

// Determine if we're running on the server once at module load time
const isServer = typeof globalThis.window === "undefined";

const trimTrailingSlash = (value: string): string => value.trim().replace(/\/+$/, "");

export function getBaseUrl(): string {
  // 1. Client-side: always use relative paths
  if (!isServer) {
    return "";
  }

  const apiBaseUrl = process.env.API_BASE_URL;
  if (apiBaseUrl?.trim()) {
    return trimTrailingSlash(apiBaseUrl);
  }

  // 2. Server-side in Production:
  if (process.env.NODE_ENV === "production") {
    const publicSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

    // Use NEXT_PUBLIC_SITE_URL if it's a valid, non-local URL
    if (
      publicSiteUrl &&
      !publicSiteUrl.includes("localhost") &&
      !publicSiteUrl.includes("0.0.0.0")
    ) {
      return trimTrailingSlash(publicSiteUrl);
    }
    // Otherwise, always fall back to the canonical production URL as a safety net
    return "https://williamcallahan.com";
  }

  // 3. Server-side in Development: fall back to localhost.
  const port = process.env.PORT || 3000;
  return `http://localhost:${port}`;
}
