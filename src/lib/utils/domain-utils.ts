/**
 * Domain Utilities
 *
 * Utility functions for transforming and normalizing domain names and URLs
 * Provides domain extraction, slug generation, and display formatting
 *
 * @module lib/utils/domain-utils
 * @see {@link @/lib/utils/url-utils} for canonical URL parsing utilities
 */

import { isContentSharingDomain } from "@/lib/config/content-sharing-domains";
import { ensureProtocol, stripWwwPrefix, getRootDomain } from "@/lib/utils/url-utils";
import { sanitizeControlChars, sanitizeTitleSlug } from "@/lib/utils/sanitize";

/**
 * Converts a title string into a URL-safe slug.
 *
 * Handles:
 * - Lowercase conversion
 * - Special character removal
 * - Whitespace to hyphen conversion
 * - Length limiting at word boundaries
 *
 * @param title - The title to convert to a slug
 * @param maxLength - Maximum length of the slug (default: 60)
 * @returns URL-safe slug string
 *
 * @example
 * titleToSlug("How to Use OpenAI for Java") // → "how-to-use-openai-for-java"
 * titleToSlug("React: Best Practices!") // → "react-best-practices"
 */
export function titleToSlug(title: string, maxLength: number = 60): string {
  if (!title || typeof title !== "string") {
    return "";
  }

  let slug = title
    .toLowerCase()
    .trim()
    // Remove apostrophes and quotes
    .replace(/['"]/g, "")
    // Replace ampersands with 'and'
    .replace(/&/g, "and");

  // Remove all non-alphanumeric characters except spaces and hyphens
  slug = sanitizeTitleSlug(slug)
    // Replace whitespace with hyphens
    .replace(/\s+/g, "-")
    // Replace multiple consecutive hyphens with a single hyphen
    .replace(/-+/g, "-")
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, "");

  // Trim to max length, preferably at a word boundary (hyphen)
  if (slug.length > maxLength) {
    // Try to cut at a hyphen near the max length
    const cutPoint = slug.lastIndexOf("-", maxLength);
    if (cutPoint > maxLength / 2) {
      // Only use the hyphen if it's in the latter half
      slug = slug.substring(0, cutPoint);
    } else {
      // Otherwise just hard cut
      slug = slug.substring(0, maxLength);
    }
    // Clean up any trailing hyphens after cutting
    slug = slug.replace(/-+$/, "");
  }

  return slug;
}

/**
 * Extract domain from URL or company name
 * Handles common URL formats and converts them to clean FQDNs
 *
 * @param {string} input - URL, domain, or company name
 * @returns {string} Normalized domain (FQDN) or original input if not URL-like
 */
export function normalizeDomain(input: string): string {
  const s = input.trim();
  if (!s) {
    return "";
  }

  try {
    // Check if this looks like it could be a URL or domain
    // Heuristic: explicit protocol, www., or something that looks like domain.tld[:port][/...]
    const looksLikeUrl =
      s.includes("://") || s.startsWith("www.") || /^[a-z0-9.-]+\.[a-z]{2,}(?::\d{2,5})?(?:[/?#]|$)/i.test(s);

    if (looksLikeUrl) {
      // Ensure we have a protocol for URL parsing
      const urlToParse = s.includes("://") ? s : `https://${s}`;

      // Parse and extract hostname, stripping www. prefix
      const urlObj = new URL(urlToParse);
      return stripWwwPrefix(urlObj.hostname);
    }

    // If it doesn't look like a URL/domain, return as-is
    // This preserves company names like "moves" or "oliverspace"
    return s;
  } catch {
    // URL constructor failed - attempt manual extraction for edge cases
    // like malformed URLs that still contain useful domain information
    try {
      // Remove protocol if present
      let domain = s.replace(/^https?:\/\//, "");
      // Remove path if present (handle noUncheckedIndexedAccess)
      domain = domain.split("/")[0] ?? "";
      // Remove port if present
      domain = domain.split(":")[0] ?? "";
      // Remove www if present
      domain = stripWwwPrefix(domain);

      // If we extracted something that looks like a domain, return it
      if (domain.includes(".")) {
        return domain;
      }
    } catch {
      // Manual extraction also failed - fall through to return original input
      // This handles truly pathological inputs where even string operations fail
    }

    // Graceful degradation: return original input when all extraction methods fail
    // This is safe for UI contexts where showing the original is better than failing
    return s;
  }
}

/**
 * Extracts a clean domain from a URL and formats it for use in URLs.
 * Handles any URL format and converts to slug format.
 *
 * **Error Handling:** Returns "unknown-domain" for unparseable inputs.
 * Errors are logged to console in non-test environments for debugging.
 *
 * @param url - The full URL to extract domain from
 * @returns A cleaned domain slug suitable for use in URLs, or "unknown-domain" on failure
 *
 * @example
 * getDomainSlug("https://www.example.com/path") // → "example-com"
 * getDomainSlug("invalid-input") // → "unknown-domain" (logged in dev)
 */
export function getDomainSlug(url: string): string {
  try {
    // First normalize the domain to get clean FQDN
    const domain = normalizeDomain(url);

    // If normalizeDomain returned empty or unchanged non-domain input
    if (!domain || !domain.includes(".")) {
      // For non-URL inputs like company names, create a slug
      const slug = domain
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      return slug || "unknown-domain";
    }

    // Convert FQDN to slug format (dots to dashes)
    const slug = domain
      .toLowerCase()
      .replace(/\./g, "-")
      .replace(/[^a-z0-9-]/g, "-") // Replace any non-alphanumeric/dash
      .replace(/-+/g, "-") // Collapse multiple dashes
      .replace(/^-+|-+$/g, ""); // Remove leading/trailing dashes

    return slug || "unknown-domain";
  } catch (error) {
    // Fallback for any parsing errors
    if (process.env.NODE_ENV !== "test") {
      console.error(`getDomainSlug: Failed to parse URL: ${url}`, error);
    }
    return "unknown-domain";
  }
}

/**
 * Generate base slug from URL for bookmark identification.
 *
 * Strategy:
 * - Content-sharing domains (YouTube, Reddit, etc.): Use title-based slugs
 * - Regular domains: Use domain + path-based slugs
 *
 * **Error Handling:** Returns "unknown-url" for unparseable URLs. This is
 * a safe fallback that allows bookmark processing to continue even with
 * malformed URLs.
 *
 * @param url - The URL to generate a slug from
 * @param title - Optional title for content-sharing domains
 * @returns Base slug string, or "unknown-url" if URL cannot be parsed
 */
function getBaseSlugFromUrl(url: string, title?: string): string {
  try {
    const urlObj = new URL(ensureProtocol(url));
    const domain = stripWwwPrefix(urlObj.hostname);

    // Check if this is a content-sharing domain
    if (isContentSharingDomain(domain) && title) {
      // Use title-based slug for content platforms
      const domainPrefix = domain.replace(/\./g, "-");
      const titleSlug = titleToSlug(title);

      // If we got a valid title slug, combine with domain
      if (titleSlug) {
        return `${domainPrefix}-${titleSlug}`;
      }
      // No valid title slug → fall through to domain+path handling below
    }

    // For regular domains, use domain + path approach
    let slug = domain.replace(/\./g, "-");

    // If there's a meaningful path, include it
    const path = urlObj.pathname;
    if (path && path !== "/" && path.length > 1) {
      const cleanPath = path.toLowerCase();

      // Strip Unicode control characters first
      const sanitizedPath = sanitizeControlChars(cleanPath)
        .replace(/^\/|\/$/g, "") // Remove leading/trailing slashes
        .replace(/\//g, "-") // Replace slashes with dashes
        .replace(/[^a-zA-Z0-9-]/g, "-") // Replace non-alphanumeric with dashes
        .replace(/-+/g, "-") // Replace multiple dashes with single dash
        .replace(/-+$/g, ""); // Remove trailing dashes

      if (sanitizedPath) {
        slug = `${slug}-${sanitizedPath}`;
      }
    }
    return slug;
  } catch {
    // URL parsing failed - use sentinel value that's safe for slugs
    return "unknown-url";
  }
}

/**
 * Generates a unique, user-friendly slug from a URL.
 *
 * For content-sharing domains (YouTube, Reddit, etc.), uses title-based slugs.
 * For regular domains, uses domain + path-based slugs.
 *
 * **Error Handling:** Returns "unknown-url" for unparseable URLs.
 * Warnings are logged in non-test environments for debugging.
 *
 * @param url - The URL to generate a slug for
 * @param allBookmarks - All bookmarks to check for uniqueness (must include title for content-sharing domains)
 * @param currentBookmarkId - The ID of the current bookmark (to exclude from uniqueness check)
 * @param title - Optional title for title-based slug generation on content-sharing domains
 * @returns A unique slug for the URL, or "unknown-url" if URL cannot be parsed
 */
export function generateUniqueSlug(
  url: string,
  allBookmarks: Array<{ id: string; url: string; title?: string }>,
  currentBookmarkId?: string,
  title?: string,
): string {
  try {
    const processedUrl = ensureProtocol(url);

    // Compute the base slug once using the helper (with title for content-sharing domains)
    const baseSlug = getBaseSlugFromUrl(processedUrl, title);

    // Build a map of all existing slugs (with their suffixes)
    const slugCounts = new Map<string, number>();

    // Process bookmarks in a deterministic order (by ID)
    const sortedBookmarks = allBookmarks.toSorted((a, b) => a.id.localeCompare(b.id));

    for (const bookmark of sortedBookmarks) {
      if (bookmark.id === currentBookmarkId) continue; // Skip current bookmark

      // Use bookmark's own title for generating its base slug
      const bookmarkBaseSlug = getBaseSlugFromUrl(bookmark.url, bookmark.title);
      const count = slugCounts.get(bookmarkBaseSlug) || 0;
      slugCounts.set(bookmarkBaseSlug, count + 1);
    }

    // Check how many bookmarks already have this base slug
    const existingCount = slugCounts.get(baseSlug) || 0;

    if (existingCount === 0) {
      return baseSlug; // First one with this slug
    }

    // Need to find our position among bookmarks with the same base slug
    let position = 1; // Start at 1 because the first gets no suffix
    for (const bookmark of sortedBookmarks) {
      if (bookmark.id === currentBookmarkId) break; // Found our position

      const bookmarkBaseSlug = getBaseSlugFromUrl(bookmark.url, bookmark.title);
      if (bookmarkBaseSlug === baseSlug) {
        position++;
      }
    }

    // First bookmark gets no suffix, others get -2, -3, etc.
    return position === 1 ? baseSlug : `${baseSlug}-${position}`;
  } catch {
    // Don't log during tests - silently handle the error
    if (process.env.NODE_ENV !== "test") {
      console.warn(`generateUniqueSlug: Falling back to 'unknown-url' for invalid input: ${url}`);
    }
    return "unknown-url";
  }
}

/**
 * Converts a domain slug back to its original form
 *
 * @param slug The domain slug to convert back
 * @returns The original domain format (without www prefix)
 */
export function slugToDomain(slug: string): string {
  return slug.replace(/-/g, ".");
}

/**
 * Gets a display name from a URL or domain.
 * Handles any URL format and returns clean domain for display.
 *
 * **Error Handling:** Uses graceful degradation - returns the original
 * input on parsing errors. Errors are logged in non-test environments.
 *
 * @param url - The URL or domain to format
 * @returns A nicely formatted domain for display, or original input on failure
 *
 * @example
 * getDisplayDomain("https://www.example.com/path") // → "example.com"
 * getDisplayDomain("invalid") // → "invalid" (original returned, error logged)
 */
export function getDisplayDomain(url: string): string {
  try {
    // Use normalizeDomain to get clean FQDN
    const domain = normalizeDomain(url);

    // If it's a clean domain, return it
    if (domain?.includes(".")) {
      return domain;
    }

    // For non-URL inputs, return as-is
    return domain || url;
  } catch (error) {
    // Fallback to original on any error
    if (process.env.NODE_ENV !== "test") {
      console.error(`getDisplayDomain: Failed to parse URL: ${url}`, error);
    }
    return url;
  }
}

/**
 * Gets domain variants to try (e.g., subdomain and root domain).
 * @param domain The domain to get variants for.
 * @returns An array of domain variants.
 */
export function getDomainVariants(domain: string): string[] {
  const variants: string[] = [domain];

  // If it's a subdomain, also try the root domain
  const parts: string[] = domain.split(".");
  if (parts.length > 2) {
    const rootDomain = getRootDomain(domain);
    if (rootDomain !== domain) {
      variants.push(rootDomain);
    }
  }

  return variants;
}
