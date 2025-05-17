/**
 * Investments Data Access
 *
 * Handles fetching and processing of investment domain data
 * This module primarily parses local investment data
 */

import { investments } from '@/data/investments';
import { readFile } from 'node:fs/promises'; // Using direct import for readFile

/**
 * Retrieves a map of investment domains to their corresponding IDs
 * It first attempts to use statically imported investment data
 * If static import fails or data is unavailable, it falls back to parsing the 'data/investments.ts' file using regex
 * This function is designed to be resilient to issues with static imports during certain build/runtime conditions
 * @returns A promise that resolves to a Map where keys are domain names (e.g., "example.com") and values are investment IDs
 */
export async function getInvestmentDomainsAndIds(): Promise<Map<string, string>> {
  const domainToIdMap = new Map<string, string>();
  try {
    if (investments && Array.isArray(investments)) {
      for (const investment of investments) {
        if (investment.id && investment.website) {
          try {
            const url = new URL(investment.website);
            const domain = url.hostname.replace(/^www\./, '');
            domainToIdMap.set(domain, investment.id);
          } catch { /* ignore invalid URLs */ }
        }
      }
      console.log(`[DataAccess/Investments] Successfully parsed ${domainToIdMap.size} investment domains via static import.`);
      return domainToIdMap;
    }
  } catch (importError: unknown) {
    console.warn(`[DataAccess/Investments] Could not use static import of investments.ts, falling back to regex parsing: ${String(importError)}`);
    // Fallback logic remains as it was, as it's a specific recovery mechanism
    const investmentsPath = 'data/investments.ts';
      try {
        const localInvestmentsPath = process.cwd() + '/' + investmentsPath;
        const investmentsContent = await readFile(localInvestmentsPath, 'utf-8');
        let currentId: string | null = null;
        // Regex to find blocks starting with 'id:'
        const investmentBlocks = investmentsContent.split(/^\s*{\s*(?:"|')id(?:"|'):/m);

        for (let i = 1; i < investmentBlocks.length; i++) { // Start from 1 as split result at 0 is before first match
            const block = investmentBlocks[i];
            if (!block) continue;

            // Extract the ID value itself
            const idMatch = block.match(/^(?:"|')([^"']+)(?:"|')/);
            if (idMatch && idMatch[1]) {
                currentId = idMatch[1];

                // Regex to find 'website:' or 'url:' and capture the domain
                const urlPatterns = [
                    /website:\s*['"](?:https?:\/\/)?(?:www\.)?([^/'"]+)['"]/g,
                    /url:\s*['"](?:https?:\/\/)?(?:www\.)?([^/'"]+)['"]/g, // Added for flexibility
                ];

                for (const pattern of urlPatterns) {
                    let urlMatch: RegExpExecArray | null;

                    while ((urlMatch = pattern.exec(block)) !== null) {
                        const capturedDomain = urlMatch[1];
                        if (typeof capturedDomain === 'string') {
                            const domain = capturedDomain; // Already cleaned by regex
                            if (currentId) {
                                domainToIdMap.set(domain, currentId);
                            }
                        }
                    }
                }
            }
        }
        console.log(`[DataAccess/Investments] Successfully parsed ${domainToIdMap.size} investment domains via regex`);
      } catch (regexParseError: unknown) {
          const message = regexParseError instanceof Error ? regexParseError.message : String(regexParseError);
          console.error('[DataAccess/Investments] Failed to parse investment domains via regex:', message);
      }
  }
  return domainToIdMap;
}
