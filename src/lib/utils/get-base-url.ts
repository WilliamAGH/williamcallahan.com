/**
 * Utility to get the base URL for API calls.
 * Returns an empty string for client-side calls (allowing relative paths)
 * and an absolute URL for server-side calls.
 */

// Determine if we're running on the server once at module load time
const isServer = typeof globalThis.window === "undefined";

export function getBaseUrl(): string {
  // 1. Client-side: always use relative paths
  if (!isServer) {
    return "";
  }

  // 2. Server-side in Production:
  if (process.env.NODE_ENV === "production") {
    const publicSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

    // Use NEXT_PUBLIC_SITE_URL if it's a valid, non-local URL
    if (publicSiteUrl && !publicSiteUrl.includes("localhost") && !publicSiteUrl.includes("0.0.0.0")) {
      return publicSiteUrl.replace(/\/$/, "");
    }
    // Otherwise, always fall back to the canonical production URL as a safety net
    return "https://williamcallahan.com";
  }

  // 3. Server-side in Development:
  // Prioritize API_BASE_URL for local development, then fall back to localhost.
  const apiBase = process.env.API_BASE_URL;
  if (apiBase) {
    return apiBase.replace(/\/$/, "");
  }

  const port = process.env.PORT || 3000;
  return `http://localhost:${port}`;
}
