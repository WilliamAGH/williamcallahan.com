/**
 * AI Analysis S3 Path Construction
 * @module lib/ai-analysis/paths
 * @description
 * S3 path construction for AI analysis persistence using environment-aware paths.
 *
 * Path structure:
 * ```
 * json/ai-analysis/{domain}{suffix}/{id}/
 * ├── latest.json                        # Always most recent (O(1) lookup)
 * └── versions/
 *     ├── 2026-02-03T10-30-00Z.json      # Timestamped versions
 *     └── ...
 * ```
 */

import { ENVIRONMENT_SUFFIX } from "@/lib/config/environment";
import type { AnalysisDomain } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Base Path Construction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the base path for a domain's analysis storage.
 * Includes environment suffix for isolation between dev/test/prod.
 */
export function buildAnalysisBasePath(domain: AnalysisDomain): string {
  return `json/ai-analysis/${domain}${ENVIRONMENT_SUFFIX}`;
}

/**
 * Build the path prefix for a specific item's analysis storage.
 */
export function buildItemAnalysisPrefix(domain: AnalysisDomain, id: string): string {
  const sanitizedId = sanitizeId(id);
  return `${buildAnalysisBasePath(domain)}/${sanitizedId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Specific Path Builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the S3 key for the latest analysis file.
 * This is the primary read path for fast lookups.
 *
 * @example
 * buildLatestAnalysisKey("bookmarks", "abc123")
 * // => "json/ai-analysis/bookmarks-dev/abc123/latest.json" (in dev)
 * // => "json/ai-analysis/bookmarks/abc123/latest.json" (in prod)
 */
export function buildLatestAnalysisKey(domain: AnalysisDomain, id: string): string {
  return `${buildItemAnalysisPrefix(domain, id)}/latest.json`;
}

/**
 * Build the S3 key for a versioned analysis file.
 * Uses ISO timestamp with colons replaced by hyphens for S3 compatibility.
 *
 * @param timestamp - ISO timestamp or Date object
 *
 * @example
 * buildVersionedAnalysisKey("bookmarks", "abc123", new Date())
 * // => "json/ai-analysis/bookmarks-dev/abc123/versions/2026-02-03T10-30-00Z.json"
 */
export function buildVersionedAnalysisKey(
  domain: AnalysisDomain,
  id: string,
  timestamp: string | Date,
): string {
  const isoString = timestamp instanceof Date ? timestamp.toISOString() : timestamp;
  // Replace colons with hyphens for S3 key compatibility
  const safeTimestamp = isoString.replace(/:/g, "-");
  return `${buildItemAnalysisPrefix(domain, id)}/versions/${safeTimestamp}.json`;
}

/**
 * Build the S3 prefix for listing all versions of an item's analysis.
 *
 * @example
 * buildVersionsPrefix("bookmarks", "abc123")
 * // => "json/ai-analysis/bookmarks-dev/abc123/versions/"
 */
export function buildVersionsPrefix(domain: AnalysisDomain, id: string): string {
  return `${buildItemAnalysisPrefix(domain, id)}/versions/`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sanitize an ID for use in S3 paths.
 * Removes or replaces characters that could cause issues.
 */
function sanitizeId(id: string): string {
  // Replace any problematic characters with underscores
  // Keep alphanumeric, hyphens, and underscores
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Extract timestamp from a versioned analysis key.
 *
 * @example
 * extractTimestampFromKey("json/ai-analysis/bookmarks/abc/versions/2026-02-03T10-30-00Z.json")
 * // => "2026-02-03T10:30:00Z"
 */
export function extractTimestampFromKey(key: string): string | null {
  const match = key.match(/\/versions\/([^/]+)\.json$/);
  if (!match?.[1]) return null;

  // Restore colons from hyphens in the time portion
  // Pattern: YYYY-MM-DDTHH-MM-SSZ -> YYYY-MM-DDTHH:MM:SSZ
  const filename = match[1];
  const restored = filename.replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3");
  return restored;
}
