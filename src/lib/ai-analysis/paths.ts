/**
 * AI Analysis Cache Tags
 * @module lib/ai-analysis/paths
 * @description
 * Cache tag construction for PostgreSQL-backed AI analysis reads.
 */

import { sanitizeCacheTag } from "@/lib/utils/sanitize";
import type { AnalysisDomain } from "@/types/ai-analysis";

const AI_ANALYSIS_CACHE_TAG_ROOT = "ai-analysis";
const AI_ANALYSIS_VERSIONS_CACHE_TAG_ROOT = "ai-analysis-versions";

export function buildAnalysisCacheTags(domain: AnalysisDomain, id: string): string[] {
  const safeDomain = sanitizeCacheTag(domain);
  const safeId = sanitizeCacheTag(id);
  return [
    AI_ANALYSIS_CACHE_TAG_ROOT,
    `${AI_ANALYSIS_CACHE_TAG_ROOT}-${safeDomain}`,
    `${AI_ANALYSIS_CACHE_TAG_ROOT}-${safeDomain}-${safeId}`,
  ];
}

export function buildAnalysisVersionsCacheTags(domain: AnalysisDomain, id: string): string[] {
  const safeDomain = sanitizeCacheTag(domain);
  const safeId = sanitizeCacheTag(id);
  return [
    AI_ANALYSIS_VERSIONS_CACHE_TAG_ROOT,
    `${AI_ANALYSIS_VERSIONS_CACHE_TAG_ROOT}-${safeDomain}`,
    `${AI_ANALYSIS_VERSIONS_CACHE_TAG_ROOT}-${safeDomain}-${safeId}`,
  ];
}
