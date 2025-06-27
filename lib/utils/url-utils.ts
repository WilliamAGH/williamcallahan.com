/**
 * URL Parsing and Analysis Utilities
 *
 * Common URL operations for detecting content types,
 * extracting domains, and analyzing URL patterns
 */

/**
 * Check if URL likely points to a logo or favicon
 */
export function isLogoUrl(url: string): boolean {
  const pathname = extractPathname(url).toLowerCase();
  return (
    pathname.includes("logo") ||
    pathname.includes("favicon") ||
    pathname.includes("icon") ||
    pathname.includes("brand") ||
    pathname.endsWith(".ico")
  );
}

/**
 * Check if URL likely points to an image
 */
export function isImageUrl(url: string): boolean {
  const pathname = extractPathname(url).toLowerCase();
  const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp"];

  // Check file extension
  if (imageExtensions.some((ext) => pathname.endsWith(ext))) {
    return true;
  }

  // Check common image path patterns
  return (
    pathname.includes("/images/") ||
    pathname.includes("/img/") ||
    pathname.includes("/media/") ||
    pathname.includes("/assets/") ||
    pathname.includes("/static/")
  );
}

/**
 * Extract domain/hostname from URL
 * Returns the original string if not a valid URL
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    // If not a valid URL, might already be a domain
    return url;
  }
}

/**
 * Extract pathname from URL
 * Returns the original string if not a valid URL
 */
export function extractPathname(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname;
  } catch {
    // If not a valid URL, treat as pathname
    return url;
  }
}

/**
 * Get base domain (remove subdomains except www)
 * e.g., blog.example.com -> example.com
 *       www.example.com -> www.example.com
 */
export function getBaseDomain(domain: string): string {
  const parts = domain.split(".");

  // Keep as-is if only 2 parts or starts with www
  if (parts.length <= 2 || parts[0] === "www") {
    return domain;
  }

  // For most cases, take last 2 parts (example.com)
  // This won't work perfectly for all TLDs (e.g., .co.uk) but is a reasonable default
  return parts.slice(-2).join(".");
}

/**
 * Normalize URL for comparison
 * Removes trailing slashes, fragments, and optionally query params
 */
export function normalizeUrlForComparison(url: string, removeQuery = false): string {
  try {
    const urlObj = new URL(url);

    // Remove fragment
    urlObj.hash = "";

    // Optionally remove query
    if (removeQuery) {
      urlObj.search = "";
    }

    // Get URL string and remove trailing slash
    let normalized = urlObj.toString();
    if (normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  } catch {
    // If not a valid URL, return as-is
    return url;
  }
}

/**
 * Check if URL is using HTTPS
 */
export function isHttpsUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Convert HTTP URL to HTTPS
 */
export function ensureHttps(url: string): string {
  try {
    const urlObj = new URL(url);
    if (urlObj.protocol === "http:") {
      urlObj.protocol = "https:";
    }
    return urlObj.toString();
  } catch {
    return url;
  }
}

/**
 * Get URL without query parameters
 */
export function stripQueryParams(url: string): string {
  try {
    const urlObj = new URL(url);
    urlObj.search = "";
    return urlObj.toString();
  } catch {
    // If not a valid URL, try simple string manipulation
    const queryIndex = url.indexOf("?");
    return queryIndex > -1 ? url.slice(0, queryIndex) : url;
  }
}

/**
 * Extract file name from URL
 */
export function extractFileName(url: string): string | null {
  const pathname = extractPathname(url);
  const segments = pathname.split("/").filter(Boolean);
  const lastSegment = segments[segments.length - 1];

  // Check if it looks like a filename (has extension)
  if (lastSegment?.includes(".")) {
    return lastSegment;
  }

  return null;
}
