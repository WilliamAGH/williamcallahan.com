/**
 * URL Parsing and Analysis Utilities
 *
 * Common URL operations for detecting content types,
 * extracting domains, and analyzing URL patterns
 */

import { IMAGE_EXTENSIONS } from "@/lib/utils/content-type";

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

  // Quick path-pattern check first (covers most CDN URLs)
  if (
    pathname.includes(`/images/`) ||
    pathname.includes("/img/") ||
    pathname.includes("/media/") ||
    pathname.includes("/assets/") ||
    pathname.includes("/static/")
  ) {
    return true;
  }

  // Fallback to extension-based check using central list
  const ext = pathname.split(".").pop() ?? "";
  return IMAGE_EXTENSIONS.includes(ext);
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
 * Known complex TLDs that should be treated as a single unit
 */
const COMPLEX_TLDS = [
  "com.br",
  "co.uk",
  "co.za",
  "co.in",
  "co.nz",
  "co.jp",
  "co.kr",
  "com.au",
  "com.cn",
  "com.mx",
  "com.ar",
  "com.tr",
  "com.tw",
  "net.au",
  "net.br",
  "net.cn",
  "net.in",
  "net.nz",
  "org.au",
  "org.br",
  "org.uk",
  "org.in",
  "org.nz",
  "gov.au",
  "gov.br",
  "gov.uk",
  "gov.in",
  "gov.cn",
  "edu.au",
  "edu.br",
  "edu.cn",
  "edu.in",
  "edu.mx",
  "ac.uk",
  "ac.jp",
  "ac.in",
  "ac.za",
  "ac.nz",
  "or.jp",
  "ne.jp",
  "gr.jp",
];

/**
 * Extract TLD from domain, supporting complex TLDs
 */
export function extractTld(domain: string): { name: string; tld: string } {
  const parts = domain.toLowerCase().split(".");

  // Check for complex TLDs
  if (parts.length >= 3) {
    const possibleComplexTld = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
    if (COMPLEX_TLDS.includes(possibleComplexTld)) {
      return {
        name: parts.slice(0, -2).join("."),
        tld: possibleComplexTld,
      };
    }
  }

  // Simple TLD
  if (parts.length >= 2) {
    return {
      name: parts.slice(0, -1).join("."),
      tld: parts[parts.length - 1] || "",
    };
  }

  // Invalid domain
  return { name: domain, tld: "" };
}

/**
 * Get base domain (remove subdomains except www)
 * e.g., blog.example.com -> example.com
 *       www.example.com -> www.example.com
 *       example.co.uk -> example.co.uk (handles complex TLDs)
 */
export function getBaseDomain(domain: string): string {
  const { name, tld } = extractTld(domain);

  if (!tld) return domain;

  const nameParts = name.split(".");

  // Keep www prefix if present
  if (nameParts.length > 1 && nameParts[0] === "www") {
    return `www.${nameParts[nameParts.length - 1]}.${tld}`;
  }

  // For simple cases, just base name + tld
  if (nameParts.length === 1) {
    return `${name}.${tld}`;
  }

  // Return just the base domain
  return `${nameParts[nameParts.length - 1]}.${tld}`;
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
