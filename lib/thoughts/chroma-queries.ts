/**
 * Chroma Query Operations for Thoughts
 * @module lib/thoughts/chroma-queries
 *
 * Provides semantic query operations for Thoughts using Chroma vector store.
 * These operations enable:
 * - Related content discovery based on semantic similarity
 * - Auto-categorization suggestions based on existing categorized thoughts
 * - Tag suggestions based on similar thoughts
 * - Full semantic search across all thoughts
 *
 * Distance interpretation:
 * - Lower distance = more similar (cosine distance: 0 = identical, 2 = opposite)
 * - Typical "related" threshold: distance < 0.5
 * - Typical "very similar" threshold: distance < 0.3
 */

import type { GetRelatedThoughtsOptions, RelatedThought, SearchThoughtsOptions } from "@/types/thoughts-chroma";
import type { Where } from "chromadb";
import { getThoughtsCollection } from "./chroma-sync";

// Re-export types for convenience
export type { GetRelatedThoughtsOptions, RelatedThought, SearchThoughtsOptions } from "@/types/thoughts-chroma";

/**
 * Finds thoughts semantically similar to the given thought.
 * Uses the source thought's embedding to find nearest neighbors.
 *
 * @param thoughtId - UUID of the source thought
 * @param options - Query options
 * @returns Array of related thoughts sorted by similarity
 */
export async function getRelatedThoughts(
  thoughtId: string,
  options: GetRelatedThoughtsOptions = {},
): Promise<RelatedThought[]> {
  const { limit = 5, maxDistance, includeDrafts = false } = options;
  const collection = await getThoughtsCollection();

  // Get the source thought's embedding
  const source = await collection.get({
    ids: [thoughtId],
    include: ["embeddings"],
  });

  if (!source.embeddings || source.embeddings.length === 0 || !source.embeddings[0]) {
    return [];
  }

  // Build where clause for filtering
  const where: Where | undefined = !includeDrafts ? { draft: false } : undefined;

  // Query for similar thoughts
  const results = await collection.query({
    queryEmbeddings: [source.embeddings[0]],
    nResults: limit + 1, // +1 because source thought will match itself
    ...(where && { where }),
    include: ["metadatas", "distances"],
  });

  // Filter out the source thought and apply distance threshold
  const related =
    results.ids[0]
      ?.map((id, index) => ({
        id,
        slug: (results.metadatas[0]?.[index]?.slug as string) ?? "",
        title: (results.metadatas[0]?.[index]?.title as string) ?? "",
        distance: results.distances?.[0]?.[index] ?? 0,
      }))
      .filter(r => r.id !== thoughtId)
      .filter(r => maxDistance === undefined || r.distance <= maxDistance)
      .slice(0, limit) ?? [];

  return related;
}

/**
 * Semantic search across thoughts.
 * Finds thoughts whose content is semantically similar to the query.
 *
 * @param query - Natural language search query
 * @param options - Search options
 * @returns Array of matching thoughts sorted by relevance
 */
export async function searchThoughts(query: string, options: SearchThoughtsOptions = {}): Promise<RelatedThought[]> {
  const { limit = 10, category, includeDrafts = false, maxDistance } = options;
  const collection = await getThoughtsCollection();

  // Build where clause with proper typing
  let where: Where | undefined;
  if (!includeDrafts && category) {
    where = { $and: [{ draft: false }, { category }] };
  } else if (!includeDrafts) {
    where = { draft: false };
  } else if (category) {
    where = { category };
  }

  const results = await collection.query({
    queryTexts: [query],
    nResults: limit,
    ...(where && { where }),
    include: ["metadatas", "distances"],
  });

  const thoughts =
    results.ids[0]
      ?.map((id, index) => ({
        id,
        slug: (results.metadatas[0]?.[index]?.slug as string) ?? "",
        title: (results.metadatas[0]?.[index]?.title as string) ?? "",
        distance: results.distances?.[0]?.[index] ?? 0,
      }))
      .filter(r => maxDistance === undefined || r.distance <= maxDistance) ?? [];

  return thoughts;
}

/**
 * Suggests a category based on semantically similar thoughts.
 * Returns the most common category among the top similar thoughts.
 *
 * @param content - Thought content to analyze
 * @param title - Thought title
 * @param minConfidence - Minimum proportion of results with same category (default: 0.4)
 * @returns Suggested category or null if no clear suggestion
 */
export async function suggestCategory(
  content: string,
  title: string,
  minConfidence: number = 0.4,
): Promise<string | null> {
  const collection = await getThoughtsCollection();

  const where: Where = {
    $and: [{ draft: false }, { category: { $ne: "" } }],
  };

  const results = await collection.query({
    queryTexts: [`${title}\n\n${content}`],
    nResults: 10,
    where,
    include: ["metadatas"],
  });

  // Count categories among results
  const categoryCounts = new Map<string, number>();
  const metadatas = results.metadatas[0];
  if (metadatas) {
    for (const meta of metadatas) {
      const cat = meta?.category as string;
      if (cat) {
        categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
      }
    }
  }

  // Return most common category if it meets confidence threshold
  const totalResults = metadatas?.length ?? 0;
  const sorted = [...categoryCounts.entries()].toSorted((a, b) => b[1] - a[1]);
  const topEntry = sorted[0];

  // Guard against division by zero when no results are found
  if (totalResults > 0 && topEntry && topEntry[1] / totalResults >= minConfidence) {
    return topEntry[0];
  }

  return null;
}

/**
 * Suggests tags based on semantically similar thoughts.
 * Returns tags weighted by similarity - tags from closer matches score higher.
 *
 * @param content - Thought content to analyze
 * @param title - Thought title
 * @param maxTags - Maximum number of tags to suggest (default: 5)
 * @returns Array of suggested tags sorted by relevance
 */
export async function suggestTags(content: string, title: string, maxTags: number = 5): Promise<string[]> {
  const collection = await getThoughtsCollection();

  const results = await collection.query({
    queryTexts: [`${title}\n\n${content}`],
    nResults: 20,
    where: { draft: false },
    include: ["metadatas", "distances"],
  });

  // Collect tags weighted by similarity (inverse distance)
  const tagScores = new Map<string, number>();

  results.metadatas[0]?.forEach((meta, index) => {
    const tagsString = meta?.tags as string;
    const distance = results.distances?.[0]?.[index] ?? 1;
    const weight = 1 / (1 + distance); // Higher weight for closer matches

    if (tagsString) {
      tagsString.split(",").forEach(tag => {
        const trimmed = tag.trim();
        if (trimmed) {
          tagScores.set(trimmed, (tagScores.get(trimmed) ?? 0) + weight);
        }
      });
    }
  });

  // Return top tags by score
  return [...tagScores.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, maxTags)
    .map(([tag]) => tag);
}

/**
 * Finds thoughts that might be duplicates or near-duplicates.
 * Useful for content management and deduplication.
 *
 * @param content - Content to check for duplicates
 * @param title - Title to check
 * @param threshold - Distance threshold for considering duplicate (default: 0.15)
 * @returns Array of potential duplicates
 */
export async function findPotentialDuplicates(
  content: string,
  title: string,
  threshold: number = 0.15,
): Promise<RelatedThought[]> {
  const collection = await getThoughtsCollection();

  const results = await collection.query({
    queryTexts: [`${title}\n\n${content}`],
    nResults: 5,
    include: ["metadatas", "distances"],
  });

  return (
    results.ids[0]
      ?.map((id, index) => ({
        id,
        slug: (results.metadatas[0]?.[index]?.slug as string) ?? "",
        title: (results.metadatas[0]?.[index]?.title as string) ?? "",
        distance: results.distances?.[0]?.[index] ?? 0,
      }))
      .filter(r => r.distance <= threshold) ?? []
  );
}

/**
 * Gets a distribution of categories across all thoughts.
 * Useful for understanding content organization.
 * Note: Iterates in batches to respect Chroma Cloud quotas.
 *
 * @returns Map of category to count
 */
export async function getCategoryDistribution(): Promise<Map<string, number>> {
  const collection = await getThoughtsCollection();

  const distribution = new Map<string, number>();
  const batchSize = 100;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const results = await collection.get({
      limit: batchSize,
      offset,
      where: { draft: false },
      include: ["metadatas"],
    });

    results.metadatas?.forEach(meta => {
      const category = (meta?.category as string) || "(uncategorized)";
      distribution.set(category, (distribution.get(category) ?? 0) + 1);
    });

    hasMore = results.ids.length === batchSize;
    offset += batchSize;
  }

  return distribution;
}

/**
 * Gets a distribution of tags across all thoughts.
 * Returns tags sorted by frequency.
 * Note: Iterates in batches to respect Chroma Cloud quotas.
 *
 * @param limit - Maximum number of tags to return (default: 20)
 * @returns Array of [tag, count] pairs sorted by count descending
 */
export async function getTagDistribution(limit: number = 20): Promise<Array<[string, number]>> {
  const collection = await getThoughtsCollection();

  const tagCounts = new Map<string, number>();
  const batchSize = 100;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const results = await collection.get({
      limit: batchSize,
      offset,
      where: { draft: false },
      include: ["metadatas"],
    });

    results.metadatas?.forEach(meta => {
      const tagsString = meta?.tags as string;
      if (tagsString) {
        tagsString.split(",").forEach(tag => {
          const trimmed = tag.trim();
          if (trimmed) {
            tagCounts.set(trimmed, (tagCounts.get(trimmed) ?? 0) + 1);
          }
        });
      }
    });

    hasMore = results.ids.length === batchSize;
    offset += batchSize;
  }

  return [...tagCounts.entries()].toSorted((a, b) => b[1] - a[1]).slice(0, limit);
}
