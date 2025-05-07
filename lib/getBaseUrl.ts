/**
 * Utility to get the base URL for API calls.
 * Returns an empty string for client-side calls (allowing relative paths)
 * and an absolute URL for server-side calls.
 */

// Determine if we're running on the server once at module load time
const isServer = typeof globalThis.window === 'undefined';

export function getBaseUrl(): string {
  // Client-side, so use relative path (empty string)
  if (!isServer) {
    return '';
  }

  // Server-side
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    // Ensure no trailing slash from the env variable if we add one
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  }

  // Fallback for local development if NEXT_PUBLIC_SITE_URL is not set
  // Ensure no trailing slash
  const port = process.env.PORT || 3000;
  return `http://localhost:${port}`;
}