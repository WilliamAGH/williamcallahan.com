/**
 * URL Parsing and Analysis Utilities
 *
 * Common URL operations for detecting content types,
 * extracting domains, and analyzing URL patterns.
 *
 * @module lib/utils/url-utils
 * @see {@link @/types/schemas/url} for security-focused URL validation (SSRF protection)
 * @see {@link @/lib/validators/url} for validation wrapper functions
 */

import { IMAGE_EXTENSIONS } from "@/lib/utils/content-type";
/**
 * Extracts the root domain (eTLD+1) from a domain string.
 * Handles complex TLDs like co.uk, com.br, etc.
 * e.g., "docs.google.com" -> "google.com"
 * e.g., "example.co.uk" -> "example.co.uk"
 *
 * @param domain - The domain to extract from
 * @returns The root domain
 */
export function getRootDomain(domain: string): string {
  if (!domain) return "";
  const { name, tld } = extractTld(domain);
  if (!tld) return domain;
  const nameParts = name.split(".");
  const baseName = nameParts.at(-1) || name;
  return `${baseName}.${tld}`;
}

/**
 * Ensures a URL string has a protocol prefix for parsing.
 * Adds https:// if no http/https prefix exists.
 *
 * This is the canonical implementation - use this instead of inline
 * `url.startsWith("http") ? url : \`https://${url}\`` patterns.
 *
 * @param url - The URL string that may or may not have a protocol
 * @returns URL string guaranteed to have http:// or https:// prefix
 *
 * @example
 * ensureProtocol("example.com") // "https://example.com"
 * ensureProtocol("http://example.com") // "http://example.com"
 * ensureProtocol("https://example.com") // "https://example.com"
 */
export function ensureProtocol(url: string): string {
  if (!url) return url;
  return url.startsWith("http") ? url : `https://${url}`;
}

/**
 * Strips the "www." prefix from a hostname.
 *
 * This is the canonical implementation for www-stripping.
 * Use this instead of inline `.replace(/^www\./, "")` patterns.
 *
 * @param hostname - The hostname to strip www. from
 * @returns Hostname without www. prefix
 *
 * @example
 * stripWwwPrefix("www.example.com") // "example.com"
 * stripWwwPrefix("example.com") // "example.com"
 * stripWwwPrefix("www.sub.example.com") // "sub.example.com"
 */
export function stripWwwPrefix(hostname: string): string {
  if (!hostname) return hostname;
  return hostname.replace(/^www\./, "");
}

/**
 * Extracts the hostname from a URL and strips the www. prefix.
 *
 * Combines URL parsing with www-stripping in a single operation.
 * This is the most common use case for domain extraction.
 *
 * @param url - The URL to extract domain from
 * @returns Hostname without www. prefix, or original string if not a valid URL
 *
 * @example
 * extractDomainWithoutWww("https://www.example.com/path") // "example.com"
 * extractDomainWithoutWww("http://example.com") // "example.com"
 * extractDomainWithoutWww("not-a-url") // "not-a-url"
 */
export function extractDomainWithoutWww(url: string): string {
  const hostname = extractDomain(url);
  return stripWwwPrefix(hostname);
}

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
const COMPLEX_TLDS = new Set([
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
]);

/**
 * Extract TLD from domain, supporting complex TLDs
 */
export function extractTld(domain: string): { name: string; tld: string } {
  const parts = domain.toLowerCase().split(".");

  // Check for complex TLDs
  if (parts.length >= 3) {
    const possibleComplexTld = `${parts.at(-2)}.${parts.at(-1)}`;
    if (COMPLEX_TLDS.has(possibleComplexTld)) {
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
      tld: parts.at(-1) || "",
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
    return `www.${nameParts.at(-1)}.${tld}`;
  }

  // For simple cases, just base name + tld
  if (nameParts.length === 1) {
    return `${name}.${tld}`;
  }

  // Return just the base domain
  return `${nameParts.at(-1)}.${tld}`;
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
  const lastSegment = segments.at(-1);

  // Check if it looks like a filename (has extension)
  if (lastSegment?.includes(".")) {
    return lastSegment;
  }

  return null;
}

/**
 * Creates a safe external href from a raw URL string.
 * Ensures the URL has a valid http/https protocol and handles edge cases.
 *
 * @param raw - The raw URL string to sanitize
 * @returns A safe URL string or null if invalid
 *
 * @example
 * safeExternalHref('example.com') // Returns 'https://example.com'
 * safeExternalHref('HTTPS://Example.com ') // Returns 'https://example.com/'
 * safeExternalHref('javascript:alert(1)') // Returns null
 * safeExternalHref('data:text/html,...') // Returns null
 */
export function safeExternalHref(raw: string): string | null {
  if (!raw) return null;

  const input = raw.trim();
  if (!input) return null;

  // Check if URL has a scheme (case-insensitive) or is protocol-relative
  const hasScheme = /^https?:\/\//i.test(input);
  const isProtocolRelative = input.startsWith("//");

  try {
    let candidate: string;
    if (hasScheme) {
      candidate = input;
    } else if (isProtocolRelative) {
      candidate = `https:${input}`;
    } else {
      candidate = `https://${input}`;
    }
    const url = new URL(candidate);

    // Only allow http and https protocols
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    // Strip credentials if present to avoid accidental credential leaks
    if (url.username || url.password) {
      url.username = "";
      url.password = "";
    }

    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Creates a safe href for both internal and external URLs.
 * Internal paths (starting with /) are returned as-is.
 * External URLs are validated and sanitized.
 *
 * @param href - The href string to sanitize
 * @returns A safe href string or '#' if invalid
 *
 * @example
 * safeHref('/about') // Returns '/about'
 * safeHref('https://example.com') // Returns 'https://example.com/'
 * safeHref('javascript:alert(1)') // Returns '#'
 */
export function safeHref(href: string): string {
  if (!href) return "#";

  // Internal paths are safe
  if (href.startsWith("/")) return href;

  // In-page anchors and query-only refs are safe
  if (href.startsWith("#") || href.startsWith("?")) return href;

  // Common non-http schemes that should pass through
  if (/^(mailto:|tel:|sms:|geo:)/i.test(href)) return href;

  // Validate external URLs
  const safeUrl = safeExternalHref(href);
  return safeUrl || "#";
}

/**
 * Check if a URL is a GitHub URL.
 * Used for special icon treatment (GitHub logo vs generic external link).
 *
 * @param url - The URL to check
 * @returns true if the URL points to github.com
 */
export function isGitHubUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(ensureProtocol(url));
    const hostname = stripWwwPrefix(parsed.hostname);
    return hostname === "github.com";
  } catch {
    // Unparseable URLs are definitionally not GitHub URLs - return false is correct
    return false;
  }
}

/**
 * Extract hostname from URL for display purposes.
 * Strips www. prefix and handles edge cases gracefully.
 *
 * **Error Handling:** This function uses graceful degradation - it returns
 * the fallback value instead of throwing when URL parsing fails. This is
 * intentional for UI display where showing "website" is preferable to errors.
 *
 * @param rawUrl - The URL to extract hostname from
 * @param fallback - Fallback value if extraction fails (default: "website")
 * @returns The extracted hostname, or `fallback` if:
 *   - `rawUrl` is empty/falsy
 *   - URL parsing fails
 *   - Hostname is empty after extraction
 *
 * @example
 * getDisplayHostname('https://www.example.com/path') // Returns 'example.com'
 * getDisplayHostname('/internal/path') // Returns 'williamcallahan.com'
 * getDisplayHostname('') // Returns 'website'
 * getDisplayHostname('not-a-url') // Returns 'website' (graceful fallback)
 */
export function getDisplayHostname(rawUrl: string, fallback = "website"): string {
  if (!rawUrl) {
    return fallback;
  }

  const candidate = rawUrl.trim();
  if (!candidate) {
    return fallback;
  }

  // Handle internal URLs
  if (candidate.startsWith("/")) {
    return "williamcallahan.com";
  }

  try {
    const url = new URL(ensureProtocol(candidate));
    const hostname = stripWwwPrefix(url.hostname).trim();
    return hostname || fallback;
  } catch {
    // Graceful degradation: return fallback for UI display rather than propagating errors
    return fallback;
  }
}
