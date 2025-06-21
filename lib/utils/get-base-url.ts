/**
 * Utility to get the base URL for API calls.
 * Returns an empty string for client-side calls (allowing relative paths)
 * and an absolute URL for server-side calls.
 */

// Determine if we're running on the server once at module load time
const isServer = typeof globalThis.window === "undefined";

export function getBaseUrl(): string {
  // Client-side, so use relative path (empty string)
  if (!isServer) {
    return "";
  }

  // Server-side: prioritize explicit environment variables defined in .env-example
  // 1. API_BASE_URL (preferred for server-to-server calls)
  // 2. NEXT_PUBLIC_SITE_URL (public-facing canonical URL)
  // 3. Production fallback to williamcallahan.com
  // 4. Final fallback: localhost with PORT or 3000

  const apiBase = process.env.API_BASE_URL;
  if (apiBase) {
    return apiBase.replace(/\/$/, "");
  }

  const publicSite = process.env.NEXT_PUBLIC_SITE_URL;
  if (publicSite) {
    return publicSite.replace(/\/$/, "");
  }

  // Production fallback - prevents 0.0.0.0 URLs
  if (process.env.NODE_ENV === "production") {
    return "https://williamcallahan.com";
  }

  const port = process.env.PORT || 3000;
  return `http://localhost:${port}`;
}
