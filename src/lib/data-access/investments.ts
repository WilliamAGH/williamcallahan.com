/**
 * Investments Data Access Module
 *
 * Handles fetching and processing of investment domain data
 * Maps investment domains to their corresponding IDs
 *
 * @module data-access/investments
 */

import { investments } from "@/data/investments";

/**
 * Retrieves a map linking investment domain names to their corresponding investment IDs
 *
 * Uses statically imported investment data to ensure availability in all runtime contexts
 * (Next.js server, Docker standalone, scripts)
 *
 * @returns Promise resolving to a map where each key is a domain name and each value is the investment ID
 */
export function getInvestmentDomainsAndIds(): Promise<Map<string, string>> {
  const domainToIdMap = new Map<string, string>();

  if (!investments || !Array.isArray(investments)) {
    console.warn("[DataAccess/Investments] Investment data not available");
    return Promise.resolve(domainToIdMap);
  }

  for (const investment of investments) {
    if (investment.id && investment.website) {
      try {
        const url = new URL(investment.website);
        const domain = url.hostname.replace(/^www\./, "");
        domainToIdMap.set(domain, investment.id);
      } catch {
        /* ignore invalid URLs */
      }
    }
  }

  return Promise.resolve(domainToIdMap);
}
