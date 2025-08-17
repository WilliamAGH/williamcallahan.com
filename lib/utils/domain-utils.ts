/**
 * Domain Utilities
 *
 * Utility functions for transforming and normalizing domain names and URLs
 * Provides domain extraction, slug generation, and display formatting
 *
 * @module lib/utils/domain-utils
 */

/**
 * Extract domain from URL or company name
 * Handles ALL URL formats and converts them to clean FQDNs
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
    // More liberal detection - anything with a dot or protocol
    const looksLikeUrl = s.includes("://") || 
                        s.startsWith("www.") || 
                        s.includes(".") ||
                        s.includes(":") || // port numbers
                        s.includes("/"); // paths
    
    if (looksLikeUrl) {
      // Ensure we have a protocol for URL parsing
      let urlToParse = s;
      if (!urlToParse.includes("://")) {
        // Add https:// if no protocol
        urlToParse = `https://${urlToParse}`;
      }
      
      // Parse and extract hostname
      const urlObj = new URL(urlToParse);
      let hostname = urlObj.hostname;
      
      // Remove www. prefix if present
      hostname = hostname.replace(/^www\./, "");
      
      // Return clean FQDN
      return hostname;
    }
    
    // If it doesn't look like a URL/domain, return as-is
    // This preserves company names like "moves" or "oliverspace"
    return s;
  } catch {
    // If URL parsing fails, try to extract domain manually
    // Handle edge cases like malformed URLs
    try {
      // Remove protocol if present
      let domain = s.replace(/^https?:\/\//, "");
      // Remove path if present (handle noUncheckedIndexedAccess)
      domain = (domain.split("/")[0] ?? "");
      // Remove port if present
      domain = (domain.split(":")[0] ?? "");
      // Remove www if present
      domain = domain.replace(/^www\./, "");
      
      // If we got something that looks like a domain, return it
      if (domain.includes(".")) {
        return domain;
      }
    } catch {
      // Fallback - return original input
    }
    
    // Last resort - return original input
    return s;
  }
}

/**
 * Extracts a clean domain from a URL and formats it for use in URLs
 * Handles any URL format and converts to slug format
 *
 * @param url The full URL to extract domain from
 * @returns A cleaned domain slug suitable for use in URLs
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
 * Generates a unique, user-friendly slug from a URL
 *
 * @param url The URL to generate a slug for
 * @param allBookmarks All bookmarks to check for uniqueness
 * @param currentBookmarkId The ID of the current bookmark (to exclude from uniqueness check)
 * @returns A unique slug for the URL
 */
export function generateUniqueSlug(
  url: string,
  allBookmarks: Array<{ id: string; url: string }>,
  currentBookmarkId?: string,
): string {
  try {
    let processedUrl = url;
    if (!processedUrl.startsWith("http://") && !processedUrl.startsWith("https://")) {
      processedUrl = `https://${processedUrl}`;
    }

    const urlObj = new URL(processedUrl);
    const domain = urlObj.hostname.replace(/^www\./, "");

    // Start with the basic domain slug
    let baseSlug = domain.replace(/\./g, "-");

    // If there's a meaningful path, include it
    const path = urlObj.pathname;
    if (path && path !== "/" && path.length > 1) {
      // Clean up the path and append it
      const cleanPath = path
        // Strip Unicode control characters first
        .replace(/[\u007F-\u009F\u200B-\u200F\u2028-\u202F\u2066-\u206F]/g, "")
        .replace(/^\/|\/$/g, "") // Remove leading/trailing slashes
        .replace(/\//g, "-") // Replace slashes with dashes
        .replace(/[^a-zA-Z0-9-]/g, "-") // Replace non-alphanumeric with dashes
        .replace(/-+/g, "-") // Replace multiple dashes with single dash
        .replace(/-+$/g, ""); // Remove trailing dashes

      if (cleanPath) {
        baseSlug = `${baseSlug}-${cleanPath}`;
      }
    }

    // Generate base slugs for all bookmarks once instead of recursively calling
    const getBaseSlugFromUrl = (url: string): string => {
      try {
        const urlToProcess = url.startsWith("http") ? url : `https://${url}`;
        const urlObj = new URL(urlToProcess);
        const domain = urlObj.hostname.replace(/^www\./, "");
        let slug = domain.replace(/\./g, "-");

        // If there's a meaningful path, include it
        const path = urlObj.pathname;
        if (path && path !== "/" && path.length > 1) {
          const cleanPath = path
            // Strip Unicode control characters first
            .replace(/[\u007F-\u009F\u200B-\u200F\u2028-\u202F\u2066-\u206F]/g, "")
            .replace(/^\/|\/$/g, "") // Remove leading/trailing slashes
            .replace(/\//g, "-") // Replace slashes with dashes
            .replace(/[^a-zA-Z0-9-]/g, "-") // Replace non-alphanumeric with dashes
            .replace(/-+/g, "-") // Replace multiple dashes with single dash
            .replace(/-+$/g, ""); // Remove trailing dashes

          if (cleanPath) {
            slug = `${slug}-${cleanPath}`;
          }
        }
        return slug;
      } catch {
        return "unknown-url";
      }
    };

    // Build a map of all existing slugs (with their suffixes)
    const slugCounts = new Map<string, number>();
    
    // Process bookmarks in a deterministic order (by ID)
    const sortedBookmarks = [...allBookmarks].sort((a, b) => a.id.localeCompare(b.id));
    
    for (const bookmark of sortedBookmarks) {
      if (bookmark.id === currentBookmarkId) continue; // Skip current bookmark
      
      const bookmarkBaseSlug = getBaseSlugFromUrl(bookmark.url);
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
      
      const bookmarkBaseSlug = getBaseSlugFromUrl(bookmark.url);
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
 * Gets a display name from a URL or domain
 * Handles any URL format and returns clean domain for display
 *
 * @param url The URL or domain to format
 * @returns A nicely formatted domain for display
 */
export function getDisplayDomain(url: string): string {
  try {
    // Use normalizeDomain to get clean FQDN
    const domain = normalizeDomain(url);
    
    // If it's a clean domain, return it
    if (domain && domain.includes(".")) {
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
    const rootDomain: string = parts.slice(-2).join(".");
    if (rootDomain !== domain) {
      variants.push(rootDomain);
    }
  }

  return variants;
}
