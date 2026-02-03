/**
 * AI Analysis S3 Reader (Server-only)
 * @module lib/ai-analysis/reader.server
 * @description
 * Server-side reader for cached AI analysis from S3.
 * Integrates with Next.js cache for optimal performance.
 */

import "server-only";

import { readJsonS3, listS3Objects } from "@/lib/s3-utils";
import { envLogger } from "@/lib/utils/env-logger";
import { buildLatestAnalysisKey, buildVersionsPrefix, extractTimestampFromKey } from "./paths";
import type {
  AnalysisDomain,
  CachedAnalysis,
  FetchAnalysisOptions,
  AnalysisVersion,
} from "./types";
import type { BookmarkAiAnalysisResponse } from "@/types/schemas/bookmark-ai-analysis";
import { persistedBookmarkAnalysisSchema } from "@/types/schemas/ai-analysis-persisted";

// ─────────────────────────────────────────────────────────────────────────────
// Type Guards and Schema Selection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the appropriate schema for a domain.
 * Returns the Zod schema for validating persisted analysis.
 *
 * @throws Error if domain doesn't have a registered schema yet
 */
function getSchemaForDomain(domain: AnalysisDomain) {
  switch (domain) {
    case "bookmarks":
      return persistedBookmarkAnalysisSchema;
    case "projects":
    case "books":
      // TODO: Add schemas when these domains are implemented
      throw new Error(
        `Schema for domain "${domain}" not yet implemented. ` +
          `Add the schema to getSchemaForDomain() before using this domain.`,
      );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Reader Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch cached analysis for a specific item.
 * Returns null if no cached analysis exists or validation fails.
 *
 * **Type Safety Contract**: The generic type T must match the analysis type
 * for the given domain. Currently only "bookmarks" is implemented, which
 * returns BookmarkAiAnalysisResponse. The schema validation ensures the
 * data structure is correct, but callers must ensure T matches the domain.
 *
 * @param domain - The analysis domain (e.g., "bookmarks")
 * @param id - The item ID
 * @param options - Optional fetch options
 * @returns Cached analysis with metadata, or null if not found
 *
 * @example
 * ```ts
 * // Correct usage - T matches domain's analysis type
 * const cached = await getCachedAnalysis<BookmarkAiAnalysisResponse>("bookmarks", "abc123");
 * ```
 */
export async function getCachedAnalysis<T = BookmarkAiAnalysisResponse>(
  domain: AnalysisDomain,
  id: string,
  options?: FetchAnalysisOptions,
): Promise<CachedAnalysis<T> | null> {
  if (options?.skipCache) {
    return null;
  }

  const key = buildLatestAnalysisKey(domain, id);

  try {
    const data = await readJsonS3<unknown>(key);

    if (!data) {
      envLogger.debug("No cached analysis found", { domain, id, key }, { category: "AiAnalysis" });
      return null;
    }

    // Validate with domain-specific schema
    const schema = getSchemaForDomain(domain);
    const parseResult = schema.safeParse(data);

    if (!parseResult.success) {
      envLogger.log(
        "Cached analysis validation failed",
        { domain, id, error: parseResult.error.message },
        { category: "AiAnalysis" },
      );
      return null;
    }

    envLogger.debug(
      "Retrieved cached analysis",
      { domain, id, generatedAt: parseResult.data.metadata.generatedAt },
      { category: "AiAnalysis" },
    );

    // Type assertion is safe here because:
    // 1. Schema validation ensures data matches the domain's expected structure
    // 2. Caller contract requires T to match the domain's analysis type
    return parseResult.data as CachedAnalysis<T>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    envLogger.log(
      "Error fetching cached analysis",
      { domain, id, error: message },
      { category: "AiAnalysis" },
    );
    return null;
  }
}

/**
 * List all versions of an item's analysis.
 * Returns versions sorted by timestamp (newest first).
 *
 * @param domain - The analysis domain
 * @param id - The item ID
 * @returns Array of version info, sorted newest first
 */
export async function listAnalysisVersions(
  domain: AnalysisDomain,
  id: string,
): Promise<AnalysisVersion[]> {
  const prefix = buildVersionsPrefix(domain, id);

  try {
    const keys = await listS3Objects(prefix);

    const versions: AnalysisVersion[] = [];

    for (const key of keys) {
      const timestamp = extractTimestampFromKey(key);
      if (timestamp) {
        versions.push({
          key,
          timestamp,
          date: timestamp,
        });
      }
    }

    // Sort by timestamp, newest first
    versions.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return versions;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    envLogger.log(
      "Error listing analysis versions",
      { domain, id, error: message },
      { category: "AiAnalysis" },
    );
    return [];
  }
}

/**
 * Check if cached analysis exists for an item.
 * Faster than getCachedAnalysis when you only need to know existence.
 *
 * @param domain - The analysis domain
 * @param id - The item ID
 * @returns True if cached analysis exists, false if not found or on error
 */
export async function hasCachedAnalysis(domain: AnalysisDomain, id: string): Promise<boolean> {
  const key = buildLatestAnalysisKey(domain, id);

  try {
    const data = await readJsonS3<unknown>(key);
    return data !== null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    envLogger.debug(
      "Error checking cached analysis existence",
      { domain, id, error: message },
      { category: "AiAnalysis" },
    );
    return false;
  }
}
