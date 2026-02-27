/**
 * RelatedContent Server Component
 *
 * Fetches and displays related content recommendations for a given source item.
 * Uses pgvector cosine similarity with blended scoring (recency + diversity).
 *
 * Two resolution paths:
 * 1. Pre-computed: reads from content_graph_artifacts (built by buildContentGraph)
 * 2. On-demand: runs findSimilarByEntity() live when pre-computed data is missing
 */

import { limitByTypeAndTotal } from "@/lib/utils/limit-by-type";
import { RelatedContentSection } from "./related-content-section";
import { debug } from "@/lib/utils/debug";
import { resolveBookmarkIdFromSlug } from "@/lib/bookmarks/slug-helpers";
import { readRelatedContent } from "@/lib/db/queries/content-graph";
import { findSimilarByEntity } from "@/lib/db/queries/cross-domain-similarity";
import { applyBlendedScoring } from "@/lib/content-graph/blended-scoring";
import { hydrateRelatedContent } from "@/lib/db/queries/content-hydration";
import type { RelatedContentProps, RelatedContentItem } from "@/types/related-content";
import type { ContentEmbeddingDomain } from "@/types/db/embeddings";

import {
  DEFAULT_MAX_PER_TYPE,
  DEFAULT_MAX_TOTAL,
  getEnabledContentTypes,
} from "@/config/related-content.config";

// CRITICAL: Check build phase AT RUNTIME using dynamic property access.
// Direct property access (process.env.NEXT_PHASE) gets inlined by Turbopack/webpack
// during build, permanently baking "phase-production-build" into the bundle.
const PHASE_ENV_KEY = "NEXT_PHASE" as const;
const BUILD_PHASE_VALUE = "phase-production-build" as const;
const isProductionBuildPhase = (): boolean => process.env[PHASE_ENV_KEY] === BUILD_PHASE_VALUE;

const normalizeTagForComparison = (tag: string): string =>
  tag.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Filter items by include/exclude type sets and excluded tags.
 * Returns a new array (never mutates input).
 */
function applyFilters(
  items: RelatedContentItem[],
  options: {
    includeTypes?: readonly string[];
    excludeTypes?: readonly string[];
    excludeIds?: readonly string[];
    excludeTags?: readonly string[];
    sourceType: string;
    sourceId: string;
  },
): RelatedContentItem[] {
  const {
    includeTypes,
    excludeTypes,
    excludeIds = [],
    excludeTags = [],
    sourceType,
    sourceId,
  } = options;

  const normalizedExcludeTags = new Set(excludeTags.map(normalizeTagForComparison).filter(Boolean));
  const hasExcludedTag = (tags: readonly string[] | undefined): boolean => {
    if (normalizedExcludeTags.size === 0 || !tags) return false;
    return tags.some((t) => normalizedExcludeTags.has(normalizeTagForComparison(t)));
  };

  let filtered = items;
  if (includeTypes) {
    const inc = new Set(includeTypes);
    filtered = filtered.filter((i) => inc.has(i.type));
  }
  if (excludeTypes) {
    const exc = new Set(excludeTypes);
    filtered = filtered.filter((i) => !exc.has(i.type));
  }
  if (excludeIds.length > 0) {
    const excIds = new Set(excludeIds);
    filtered = filtered.filter((i) => !(i.type === sourceType && excIds.has(i.id)));
  }
  // Exclude the source entity itself
  filtered = filtered.filter((i) => !(i.type === sourceType && i.id === sourceId));
  // Exclude items with excluded tags
  filtered = filtered.filter((i) => !hasExcludedTag(i.metadata.tags));

  return filtered;
}

/**
 * Try pre-computed related content from the content graph artifacts.
 * Returns hydrated items or null if no pre-computed data exists.
 */
async function resolveFromPrecomputed(contentKey: string): Promise<RelatedContentItem[] | null> {
  const precomputed = await readRelatedContent();
  const entries = precomputed?.[contentKey];
  if (!entries || entries.length === 0) return null;

  // Build ScoredCandidate-shaped objects for hydration
  const candidates = entries.map((e) => ({
    domain: e.type as ContentEmbeddingDomain,
    entityId: e.id,
    title: e.title,
    similarity: e.score,
    contentDate: null,
    score: e.score,
  }));

  return hydrateRelatedContent(candidates);
}

/**
 * Compute related content on-demand via pgvector ANN search.
 */
async function resolveOnDemand(
  sourceType: string,
  sourceId: string,
): Promise<RelatedContentItem[]> {
  const sourceDomain = sourceType as ContentEmbeddingDomain;

  const candidates = await findSimilarByEntity({
    sourceDomain,
    sourceId,
    limit: 30,
  });

  if (candidates.length === 0) return [];

  const scored = applyBlendedScoring(candidates, {
    maxPerDomain: 5,
    maxTotal: 20,
  });

  return hydrateRelatedContent(scored);
}

export async function RelatedContent({
  sourceType,
  sourceId,
  sourceSlug,
  sectionTitle = "Similar Content",
  options = {},
  className,
}: RelatedContentProps) {
  if (isProductionBuildPhase()) {
    return null;
  }

  try {
    // For bookmarks, prefer slug over ID for idempotency
    let actualSourceId = sourceId;
    if (sourceType === "bookmark" && sourceSlug) {
      const bookmarkId = await resolveBookmarkIdFromSlug(sourceSlug);
      if (bookmarkId) {
        actualSourceId = bookmarkId;
        debug(`[RelatedContent] Using slug "${sourceSlug}" resolved to ID "${bookmarkId}"`);
      } else {
        console.error(`[RelatedContent] No bookmark found for slug "${sourceSlug}"`);
        return null;
      }
    }

    const {
      maxPerType = DEFAULT_MAX_PER_TYPE,
      maxTotal = DEFAULT_MAX_TOTAL,
      includeTypes,
      excludeTypes,
      excludeIds = [],
      excludeTags = [],
    } = options;

    const contentKey = `${sourceType}:${actualSourceId}`;

    // Path 1: try pre-computed content graph
    let items = await resolveFromPrecomputed(contentKey);

    // Path 2: fall back to on-demand pgvector search
    if (!items || items.length === 0) {
      items = await resolveOnDemand(sourceType, actualSourceId);
    }

    if (items.length === 0) return null;

    // Apply user-specified filters
    const filtered = applyFilters(items, {
      includeTypes,
      excludeTypes,
      excludeIds,
      excludeTags,
      sourceType,
      sourceId: actualSourceId,
    });

    // Filter to only environment-enabled types
    const enabledTypes = new Set(getEnabledContentTypes());
    const enabledItems = filtered.filter((i) => enabledTypes.has(i.type));

    // Apply per-type and total limits
    const limited = limitByTypeAndTotal(enabledItems, maxPerType, maxTotal);

    if (limited.length === 0) return null;

    return (
      <RelatedContentSection
        title={sectionTitle}
        items={limited}
        className={className}
        sourceType={sourceType}
      />
    );
  } catch (error) {
    console.error("Error fetching related content:", error);
    return null;
  }
}
