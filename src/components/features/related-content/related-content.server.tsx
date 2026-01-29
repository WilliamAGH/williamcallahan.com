/**
 * RelatedContent Server Component
 *
 * Fetches and displays related content recommendations for a given source item.
 * Uses server-side rendering for optimal performance and SEO.
 */

import { getContentById, filterByTypes } from "@/lib/content-similarity/aggregator";
import { getLazyContentMap, getCachedAllContent } from "@/lib/content-similarity/cached-aggregator";
import { findMostSimilar, limitByTypeAndTotal } from "@/lib/content-similarity";
import { ServerCacheInstance, getDeterministicTimestamp } from "@/lib/server-cache";
import { RelatedContentSection } from "./related-content-section";
import { ensureAbsoluteUrl } from "@/lib/seo/utils";
import { debug, isDebug } from "@/lib/utils/debug";
import { resolveBookmarkIdFromSlug } from "@/lib/bookmarks/slug-helpers";
import { readJsonS3 } from "@/lib/s3-utils";
import { CONTENT_GRAPH_S3_PATHS } from "@/lib/constants";
import { buildCdnUrl, getCdnConfigFromEnv } from "@/lib/utils/cdn-utils";
import { getRuntimeLogoUrl } from "@/lib/data-access/logos";
import { getLogoFromManifestAsync } from "@/lib/image-handling/image-manifest-loader";
import { normalizeDomain } from "@/lib/utils/domain-utils";
import { getCompanyPlaceholder } from "@/lib/data-access/placeholder-images";
import type {
  RelatedContentProps,
  RelatedContentItem,
  RelatedContentType,
  NormalizedContent,
  RelatedContentCacheData,
} from "@/types/related-content";

// Import configuration with documented rationale
import { DEFAULT_MAX_PER_TYPE, DEFAULT_MAX_TOTAL, getEnabledContentTypes } from "@/config/related-content.config";

// CRITICAL: Check build phase AT RUNTIME using dynamic property access.
// Direct property access (process.env.NEXT_PHASE) gets inlined by Turbopack/webpack
// during build, permanently baking "phase-production-build" into the bundle.
// Using bracket notation with a variable key prevents static analysis and inlining.
const PHASE_ENV_KEY = "NEXT_PHASE" as const;
const BUILD_PHASE_VALUE = "phase-production-build" as const;
const isProductionBuildPhase = (): boolean => process.env[PHASE_ENV_KEY] === BUILD_PHASE_VALUE;

/**
 * Convert normalized content to related content item
 */
async function toRelatedContentItem(
  content: NormalizedContent & { score: number },
): Promise<RelatedContentItem | null> {
  const display = content.display;
  const safeDateIso = content.date && Number.isFinite(content.date.getTime()) ? content.date.toISOString() : undefined;
  const baseMetadata: RelatedContentItem["metadata"] = {
    tags: content.tags,
    domain: content.domain,
    date: safeDateIso,
  };

  switch (content.type) {
    case "bookmark": {
      const metadata: RelatedContentItem["metadata"] = {
        ...baseMetadata,
        imageUrl: display?.imageUrl ? ensureAbsoluteUrl(display.imageUrl) : undefined,
      };

      return {
        type: content.type,
        id: content.id,
        title: content.title,
        description: display?.description || "",
        url: content.url,
        score: content.score,
        metadata,
      };
    }

    case "blog": {
      const metadata: RelatedContentItem["metadata"] = {
        ...baseMetadata,
        readingTime: display?.readingTime,
        imageUrl: display?.imageUrl ? ensureAbsoluteUrl(display.imageUrl) : undefined,
        author: display?.author
          ? {
              name: display.author.name,
              avatar: display.author.avatar ? ensureAbsoluteUrl(display.author.avatar) : undefined,
            }
          : undefined,
      };

      return {
        type: content.type,
        id: content.id,
        title: content.title,
        description: display?.description || "",
        url: content.url,
        score: content.score,
        metadata,
      };
    }

    case "investment": {
      const investmentDetails = display?.investment;
      let logoUrl = display?.imageUrl ? ensureAbsoluteUrl(display.imageUrl) : undefined;

      if (!logoUrl) {
        const effectiveDomain = investmentDetails?.logoOnlyDomain
          ? normalizeDomain(investmentDetails.logoOnlyDomain)
          : investmentDetails?.website
            ? normalizeDomain(investmentDetails.website)
            : investmentDetails?.name
              ? normalizeDomain(investmentDetails.name)
              : undefined;

        if (effectiveDomain) {
          const manifestEntry = await getLogoFromManifestAsync(effectiveDomain);
          if (manifestEntry?.cdnUrl) {
            logoUrl = ensureAbsoluteUrl(manifestEntry.cdnUrl);
          } else {
            const runtimeUrl = getRuntimeLogoUrl(effectiveDomain, {
              company: investmentDetails?.name,
            });
            logoUrl = runtimeUrl ? ensureAbsoluteUrl(runtimeUrl) : ensureAbsoluteUrl(getCompanyPlaceholder());
          }
        } else {
          logoUrl = ensureAbsoluteUrl(getCompanyPlaceholder());
        }
      }

      const metadata: RelatedContentItem["metadata"] = {
        ...baseMetadata,
        stage: display?.stage,
        category: display?.category,
        imageUrl: logoUrl,
        aventureUrl: display?.aventureUrl,
      };

      return {
        type: content.type,
        id: content.id,
        title: content.title,
        description: display?.description || "",
        url: content.url,
        score: content.score,
        metadata,
      };
    }

    case "project": {
      const imageKey = display?.project?.imageKey;
      const metadata: RelatedContentItem["metadata"] = imageKey
        ? { ...baseMetadata, imageUrl: buildCdnUrl(imageKey, getCdnConfigFromEnv()) }
        : baseMetadata;

      return {
        type: content.type,
        id: content.id,
        title: content.title,
        description: display?.description || content.text,
        url: content.url,
        score: content.score,
        metadata,
      };
    }

    case "book": {
      const bookDetails = display?.book;
      const metadata: RelatedContentItem["metadata"] = {
        ...baseMetadata,
        imageUrl: display?.imageUrl ? ensureAbsoluteUrl(display.imageUrl) : undefined,
        authors: bookDetails?.authors,
        formats: bookDetails?.formats,
      };

      return {
        type: content.type,
        id: content.id,
        title: content.title,
        description: display?.description || "",
        url: content.url,
        score: content.score,
        metadata,
      };
    }

    default:
      return {
        type: content.type,
        id: content.id,
        title: content.title,
        description: content.text,
        url: content.url,
        score: content.score,
        metadata: baseMetadata,
      };
  }
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

    // Extract options with defaults
    const {
      maxPerType = DEFAULT_MAX_PER_TYPE,
      maxTotal = DEFAULT_MAX_TOTAL,
      includeTypes,
      excludeTypes,
      excludeIds = [],
      excludeTags = [],
      weights, // Don't default - let algorithm choose appropriate weights
    } = options;

    const normalizeTagForComparison = (tag: string): string =>
      tag.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();

    const normalizedExcludeTags = new Set(excludeTags.map(normalizeTagForComparison).filter(Boolean));

    // Helper to check if item has any excluded tags
    const hasExcludedTag = (tags: readonly string[] | undefined): boolean => {
      if (normalizedExcludeTags.size === 0 || !tags) return false;
      return tags.some(tag => normalizedExcludeTags.has(normalizeTagForComparison(tag)));
    };

    // Try to load pre-computed related content first
    const contentKey = `${sourceType}:${actualSourceId}`;
    const precomputed = await readJsonS3<
      Record<
        string,
        {
          type: RelatedContentType;
          id: string;
          score: number;
          title: string;
        }[]
      >
    >(CONTENT_GRAPH_S3_PATHS.RELATED_CONTENT);

    if (precomputed?.[contentKey]) {
      // Use pre-computed scores
      let items = precomputed[contentKey];

      // Apply filters
      if (includeTypes) {
        const inc = new Set(includeTypes);
        items = items.filter(item => inc.has(item.type));
      }
      if (excludeTypes) {
        const exc = new Set(excludeTypes);
        items = items.filter(item => !exc.has(item.type));
      }
      if (excludeIds.length > 0) {
        items = items.filter(item => !(item.type === sourceType && excludeIds.includes(item.id)));
      }

      // Get all content for mapping BEFORE limiting - we need tags to filter by excludeTags
      // Use lazy loading to reduce memory pressure
      const neededTypes = Array.from(new Set(items.map(item => item.type)));
      const contentMap = await getLazyContentMap(neededTypes);

      // Convert to RelatedContentItem format
      const relatedItemPromises = items.map(async item => {
        const content = contentMap.get(`${item.type}:${item.id}`);
        if (!content) return null;
        const relatedItem = await toRelatedContentItem({ ...content, score: item.score });
        return relatedItem;
      });

      // Filter by excludeTags BEFORE applying limits to ensure we get the requested count
      const resolvedItems = await Promise.all(relatedItemPromises);
      const filteredItems = resolvedItems
        .filter((i): i is RelatedContentItem => i !== null)
        .filter(i => !hasExcludedTag(i.metadata.tags));

      // Apply limits via shared helper AFTER excludeTags filtering
      const relatedItems = limitByTypeAndTotal(filteredItems, maxPerType, maxTotal);

      // If precomputed items exist but are missing some allowed content types (e.g., projects, books),
      // compute additional candidates for just the missing types and merge.
      // Use centralized config to get enabled types (filters out production-hidden types like "thought")
      const enabledTypes = getEnabledContentTypes();
      const allAllowedTypes = includeTypes
        ? new Set(includeTypes.filter(t => enabledTypes.includes(t)))
        : new Set(enabledTypes);
      const presentTypes = new Set(relatedItems.map(i => i.type));
      const missingTypes = Array.from(allAllowedTypes).filter(t => !presentTypes.has(t));

      if (missingTypes.length > 0) {
        const source = await getContentById(sourceType, actualSourceId);
        if (source) {
          // Load all content and filter
          let allContent = await getCachedAllContent();
          if (includeTypes || excludeTypes) {
            allContent = filterByTypes(
              allContent,
              includeTypes ? Array.from(new Set(includeTypes)) : undefined,
              excludeTypes ? Array.from(new Set(excludeTypes)) : undefined,
            );
          }

          const excludeSet = new Set([...excludeIds, actualSourceId]);
          const precomputedKeys = new Set(relatedItems.map(i => `${i.type}:${i.id}`));

          const candidates = allContent
            .filter(item => !(item.type === sourceType && excludeSet.has(item.id)))
            .filter(item => missingTypes.includes(item.type))
            .filter(item => !precomputedKeys.has(`${item.type}:${item.id}`))
            .filter(item => !hasExcludedTag(item.tags));

          const extraSimilar = findMostSimilar(source, candidates, maxTotal * 2, weights);

          // Prepare slug mapping only if needed for bookmarks in the extras
          const extraItemsResolved = await Promise.all(extraSimilar.map(item => toRelatedContentItem(item)));
          const extraItems = extraItemsResolved.filter((i): i is RelatedContentItem => i !== null);

          // Merge, dedupe, and re-limit per type and total
          const merged: RelatedContentItem[] = [];
          const seen = new Set<string>();
          for (const it of [...relatedItems, ...extraItems]) {
            const key = `${it.type}:${it.id}`;
            if (!seen.has(key)) {
              seen.add(key);
              merged.push(it);
            }
          }

          const final = limitByTypeAndTotal(merged, maxPerType, maxTotal);
          if (final.length > 0) {
            return (
              <RelatedContentSection title={sectionTitle} items={final} className={className} sourceType={sourceType} />
            );
          }
        }
      }

      if (relatedItems.length > 0) {
        return (
          <RelatedContentSection
            title={sectionTitle}
            items={relatedItems}
            className={className}
            sourceType={sourceType}
          />
        );
      }
    }

    // Check cache first
    const getRelatedContent = ServerCacheInstance.getRelatedContent;
    let cached: RelatedContentCacheData | undefined;
    if (getRelatedContent && typeof getRelatedContent === "function") {
      cached = getRelatedContent.call(ServerCacheInstance, sourceType, actualSourceId);
    }
    const now = getDeterministicTimestamp();
    if (cached && cached.timestamp > now - 24 * 60 * 60 * 1000 && !isDebug) {
      // Apply filtering to cached results
      let items = cached.items;

      if (includeTypes || excludeTypes) {
        items = filterByTypes(
          items,
          includeTypes ? Array.from(new Set(includeTypes)) : undefined,
          excludeTypes ? Array.from(new Set(excludeTypes)) : undefined,
        );
      }

      // Filter by excluded tags
      if (excludeTags.length > 0) {
        items = items.filter(item => !hasExcludedTag(item.tags));
      }

      // Apply limits via shared helper
      const finalItems = limitByTypeAndTotal(items, maxPerType, maxTotal);

      const relatedItemPromises = finalItems.map(async item => {
        const relatedItem = await toRelatedContentItem(item);
        return relatedItem;
      });

      const resolvedRelatedItems = await Promise.all(relatedItemPromises);
      const relatedItems = resolvedRelatedItems.filter((i): i is RelatedContentItem => i !== null);

      if (relatedItems.length === 0) {
        return null;
      }
      return (
        <RelatedContentSection
          title={sectionTitle}
          items={relatedItems}
          className={className}
          sourceType={sourceType}
        />
      );
    }

    // Get source content
    const source = await getContentById(sourceType, actualSourceId);
    if (!source) {
      console.error(`Content not found: ${sourceType}/${actualSourceId}`);
      return null;
    }

    // Get all content using cached version to reduce redundant fetches
    let allContent = await getCachedAllContent();

    // Filter by include/exclude types
    if (includeTypes || excludeTypes) {
      allContent = filterByTypes(
        allContent,
        includeTypes ? Array.from(new Set(includeTypes)) : undefined,
        excludeTypes ? Array.from(new Set(excludeTypes)) : undefined,
      );
    }

    // Exclude the source item and any specified IDs
    const allExcludeIds = new Set([...excludeIds, actualSourceId]);

    const candidates = allContent
      .filter(item => !(item.type === sourceType && allExcludeIds.has(item.id)))
      .filter(item => !hasExcludedTag(item.tags));

    // Find similar content
    const similar = findMostSimilar(source, candidates, maxTotal * 2, weights);

    // Apply limits via shared helper
    const finalItems = limitByTypeAndTotal(similar, maxPerType, maxTotal);

    // Cache the results only if no ID or tag filtering was applied
    // excludeIds/excludeTags affect computed candidates, so caching with them
    // would pollute the cache with incomplete results for non-excluded requests
    const setRelatedContent = ServerCacheInstance.setRelatedContent;
    const hasExcludeFilters = excludeIds.length > 0 || excludeTags.length > 0;
    if (setRelatedContent && typeof setRelatedContent === "function" && !hasExcludeFilters) {
      setRelatedContent.call(ServerCacheInstance, sourceType, actualSourceId, {
        items: finalItems,
        timestamp: getDeterministicTimestamp(),
      });
    }

    // Convert to RelatedContentItem format
    const relatedItemPromises = finalItems.map(async item => {
      const relatedItem = await toRelatedContentItem(item);
      return relatedItem;
    });

    const resolvedItems = await Promise.all(relatedItemPromises);
    const relatedItems = resolvedItems.filter((i): i is RelatedContentItem => i !== null);

    // Return nothing if no related items found
    if (relatedItems.length === 0) {
      return null;
    }

    return (
      <RelatedContentSection title={sectionTitle} items={relatedItems} className={className} sourceType={sourceType} />
    );
  } catch (error) {
    console.error("Error fetching related content:", error);
    return null;
  }
}
