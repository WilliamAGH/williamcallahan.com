/**
 * Investments Data Access Module
 *
 * Handles fetching and processing of investment domain data
 * Maps investment domains to their corresponding IDs with fallback parsing mechanisms
 *
 * @module data-access/investments
 */

import { readFile } from "node:fs/promises"; // Using direct import for readFile

// NOTE: Removed static import to prevent module loading failures in Docker/standalone scripts
// Will use dynamic import inside the function to allow graceful fallback

/**
 * Asynchronously retrieves a map linking investment domain names to their corresponding investment IDs
 *
 * Uses dynamically imported investment data or falls back to parsing the raw data/investments.ts file
 *
 * @returns Promise resolving to a map where each key is a domain name and each value is the investment ID
 * @remark Resilient to static import failures and will attempt file-based parsing as fallback
 */
export async function getInvestmentDomainsAndIds(): Promise<Map<string, string>> {
  const domainToIdMap = new Map<string, string>();

  try {
    // Use dynamic import to avoid module loading failures
    const { investments } = await import("@/data/investments");

    if (investments && Array.isArray(investments)) {
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
      console.log(
        `[DataAccess/Investments] Successfully parsed ${domainToIdMap.size} investment domains via dynamic import.`,
      );
      return domainToIdMap;
    }
  } catch (importError: unknown) {
    console.warn(
      `[DataAccess/Investments] Could not use dynamic import of investments.ts, falling back to regex parsing: ${String(importError)}`,
    );
    // Fallback logic remains as it was, as it's a specific recovery mechanism
    const investmentsPath = "data/investments.ts";
    try {
      const localInvestmentsPath = `${process.cwd()}/${investmentsPath}`;
      const investmentsContent = await readFile(localInvestmentsPath, "utf-8");
      let currentId: string | null = null;
      // Regex to find blocks starting with 'id:'
      const investmentBlocks = investmentsContent.split(/^\s*{\s*(?:"|')id(?:"|'):/m);

      for (let i = 1; i < investmentBlocks.length; i++) {
        // Start from 1 as split result at 0 is before first match
        const block = investmentBlocks[i];
        if (!block) continue;

        // Extract the ID value itself
        const idMatch = block.match(/^(?:"|')([^"']+)(?:"|')/);
        if (idMatch?.length && idMatch[1]) {
          currentId = idMatch[1];

          // Regex to find 'website:' or 'url:' and capture the domain
          const urlPatterns = [
            /website:\s*['"](?:https?:\/\/)?(?:www\.)?([^/'"]+)['"]/g,
            /url:\s*['"](?:https?:\/\/)?(?:www\.)?([^/'"]+)['"]/g, // Added for flexibility
          ];

          for (const pattern of urlPatterns) {
            let urlMatch: RegExpExecArray | null = pattern.exec(block);
            while (urlMatch !== null) {
              const capturedDomain = urlMatch[1];
              if (typeof capturedDomain === "string") {
                const domain = capturedDomain; // Already cleaned by regex
                if (currentId) {
                  domainToIdMap.set(domain, currentId);
                }
              }
              urlMatch = pattern.exec(block);
            }
          }
        }
      }
      console.log(`[DataAccess/Investments] Successfully parsed ${domainToIdMap.size} investment domains via regex`);
    } catch (regexParseError: unknown) {
      const message = regexParseError instanceof Error ? regexParseError.message : String(regexParseError);
      console.error("[DataAccess/Investments] Failed to parse investment domains via regex:", message);
    }
  }
  return domainToIdMap;
}
