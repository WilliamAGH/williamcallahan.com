/**
 * Server-side logo interface - primary entry point for components
 *
 * Exports: fetchLogo(), normalizeDomain()
 * Usage: import { fetchLogo } from '@/lib/logo.server'
 *
 * @module lib/logo.server
 */

import type { LogoSource } from "@/types/logo";
import { getLogo as getLogoFromDataAccess } from "./data-access/logos";
import { normalizeDomain } from "./utils/domain-utils";

/**
 * Fetch a logo for a given domain or company name.
 *
 * This is the main entry point for server components to get logos.
 * It handles the complete flow:
 * 1. Memory cache check (ServerCacheInstance with TTL)
 * 2. S3 storage check (permanent storage with source tracking)
 * 3. External API fetch (Google HD → Clearbit HD → Google MD → Clearbit MD → DuckDuckGo)
 * 4. Validation against generic globe icons
 * 5. Automatic persistence to S3
 * 6. Fallback to placeholder SVG if all sources fail
 *
 * @param domainOrCompany - Domain name (e.g. "example.com") or company name
 * @returns Logo data with buffer, source, and content type, or null if failed
 */
export async function fetchLogo(domainOrCompany: string): Promise<{
  buffer: Buffer | null;
  source: LogoSource | null;
  error?: string;
}> {
  if (!domainOrCompany) {
    return { buffer: null, source: null, error: "Domain or company name required" };
  }

  // Normalize the input - extract domain from URL or clean company name
  const domain = normalizeDomain(domainOrCompany);

  // Use the unified data access layer
  const result = await getLogoFromDataAccess(domain);

  if (result?.buffer) {
    return {
      buffer: result.buffer,
      source: result.source,
    };
  }

  return {
    buffer: null,
    source: null,
    error: "Failed to fetch logo",
  };
}

export { normalizeDomain } from "./utils/domain-utils";
