/**
 * AI Analysis S3 Reader (Server-only)
 * @module lib/ai-analysis/reader.server
 * @description
 * Server-side reader for cached AI analysis from S3.
 * Integrates with Next.js cache for optimal performance.
 *
 * Uses Cache Components so S3 reads remain cache-safe without
 * request-only APIs like `connection()`.
 */

import "server-only";

import { readJsonS3Optional } from "@/lib/s3/json";
import { listS3Objects } from "@/lib/s3/objects";
import { envLogger } from "@/lib/utils/env-logger";
import { cacheContextGuards } from "@/lib/cache";
import { buildLatestAnalysisKey, buildVersionsPrefix, extractTimestampFromKey } from "./paths";
import type {
  AnalysisDomain,
  CachedAnalysis,
  FetchAnalysisOptions,
  AnalysisVersion,
} from "./types";
import type { BookmarkAiAnalysisResponse } from "@/types/schemas/bookmark-ai-analysis";
import type { BookAiAnalysisResponse } from "@/types/schemas/book-ai-analysis";
import type { ProjectAiAnalysisResponse } from "@/types/schemas/project-ai-analysis";
import {
  persistedBookmarkAnalysisSchema,
  persistedBookAnalysisSchema,
  persistedProjectAnalysisSchema,
} from "@/types/schemas/ai-analysis-persisted";

// ─────────────────────────────────────────────────────────────────────────────
// Private Cached Implementations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Internal cached implementation for getCachedAnalysis.
 * No options parameter - the skipCache decision is made in the public wrapper.
 */
async function getCachedAnalysisInternal(
  domain: AnalysisDomain,
  id: string,
): Promise<CachedAnalysis<unknown> | null> {
  "use cache";

  cacheContextGuards.cacheLife("AiAnalysis", { revalidate: 3600 }); // 1 hour
  cacheContextGuards.cacheTag("AiAnalysis", "ai-analysis", `ai-analysis-${domain}`);
  cacheContextGuards.cacheTag("AiAnalysis", `ai-analysis-${domain}-${id}`);

  const key = buildLatestAnalysisKey(domain, id);

  // Domain-specific schema selection with explicit type narrowing
  let data: CachedAnalysis<unknown> | null;
  switch (domain) {
    case "bookmarks":
      data = await readJsonS3Optional(key, persistedBookmarkAnalysisSchema);
      break;
    case "books":
      data = await readJsonS3Optional(key, persistedBookAnalysisSchema);
      break;
    case "projects":
      data = await readJsonS3Optional(key, persistedProjectAnalysisSchema);
      break;
  }

  if (!data) {
    envLogger.debug("No cached analysis found", { domain, id, key }, { category: "AiAnalysis" });
    return null;
  }

  envLogger.debug(
    "Retrieved cached analysis",
    { domain, id, generatedAt: data.metadata.generatedAt },
    { category: "AiAnalysis" },
  );

  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Reader Functions
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Type-safe overloads for getCachedAnalysis
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch cached bookmark analysis.
 * @param domain - Must be "bookmarks"
 * @param id - The bookmark ID
 * @param options - Optional fetch options
 * @returns Cached analysis with metadata, or null if not found
 */
export async function getCachedAnalysis(
  domain: "bookmarks",
  id: string,
  options?: FetchAnalysisOptions,
): Promise<CachedAnalysis<BookmarkAiAnalysisResponse> | null>;

/**
 * Fetch cached book analysis.
 * @param domain - Must be "books"
 * @param id - The book ID
 * @param options - Optional fetch options
 * @returns Cached analysis with metadata, or null if not found
 */
export async function getCachedAnalysis(
  domain: "books",
  id: string,
  options?: FetchAnalysisOptions,
): Promise<CachedAnalysis<BookAiAnalysisResponse> | null>;

/**
 * Fetch cached project analysis.
 * @param domain - Must be "projects"
 * @param id - The project ID
 * @param options - Optional fetch options
 * @returns Cached analysis with metadata, or null if not found
 */
export async function getCachedAnalysis(
  domain: "projects",
  id: string,
  options?: FetchAnalysisOptions,
): Promise<CachedAnalysis<ProjectAiAnalysisResponse> | null>;

/**
 * Generic overload for dynamic domain values (e.g., from runtime variables).
 * Returns a union type since the specific type cannot be determined statically.
 * @param domain - The analysis domain
 * @param id - The item ID
 * @param options - Optional fetch options
 * @returns Cached analysis with metadata, or null if not found
 */
export async function getCachedAnalysis<
  T extends BookmarkAiAnalysisResponse | BookAiAnalysisResponse | ProjectAiAnalysisResponse,
>(
  domain: AnalysisDomain,
  id: string,
  options?: FetchAnalysisOptions,
): Promise<CachedAnalysis<T> | null>;

/**
 * Implementation: Fetch cached analysis for a specific item.
 * Returns null if no cached analysis exists or validation fails.
 *
 * The skipCache option is handled BEFORE the cache boundary to ensure
 * correct cache behavior. The internal function handles the actual
 * cached S3 read with proper cacheLife/cacheTag directives.
 */
export async function getCachedAnalysis(
  domain: AnalysisDomain,
  id: string,
  options?: FetchAnalysisOptions,
): Promise<CachedAnalysis<unknown> | null> {
  // Handle skipCache BEFORE the cache boundary
  if (options?.skipCache) {
    return null;
  }

  // Delegate to the internal cached function
  return getCachedAnalysisInternal(domain, id);
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
  "use cache";

  cacheContextGuards.cacheLife("AiAnalysis", { revalidate: 3600 }); // 1 hour
  cacheContextGuards.cacheTag(
    "AiAnalysis",
    "ai-analysis-versions",
    `ai-analysis-versions-${domain}`,
  );
  cacheContextGuards.cacheTag("AiAnalysis", `ai-analysis-versions-${domain}-${id}`);

  const prefix = buildVersionsPrefix(domain, id);
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
  "use cache";

  cacheContextGuards.cacheLife("AiAnalysis", { revalidate: 3600 }); // 1 hour
  cacheContextGuards.cacheTag("AiAnalysis", "ai-analysis-exists", `ai-analysis-exists-${domain}`);
  cacheContextGuards.cacheTag("AiAnalysis", `ai-analysis-exists-${domain}-${id}`);

  const key = buildLatestAnalysisKey(domain, id);

  // Domain-specific schema selection
  let data: unknown;
  switch (domain) {
    case "bookmarks":
      data = await readJsonS3Optional(key, persistedBookmarkAnalysisSchema);
      break;
    case "books":
      data = await readJsonS3Optional(key, persistedBookAnalysisSchema);
      break;
    case "projects":
      data = await readJsonS3Optional(key, persistedProjectAnalysisSchema);
      break;
  }
  return data !== null;
}
