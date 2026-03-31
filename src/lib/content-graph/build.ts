/**
 * Content Graph Builder
 *
 * Pre-computes related content mappings and tag co-occurrence graphs
 * using pgvector cosine similarity on the unified embeddings table.
 *
 * @module content-graph/build
 */

import logger from "@/lib/utils/logger";
import { getMonotonicTime } from "@/lib/utils";
import type { DataFetchConfig, DataFetchOperationSummary } from "@/types/lib";
import { CONTENT_GRAPH_ARTIFACT_TYPES } from "@/lib/db/schema/content-graph";
import { findSimilarByEntity } from "@/lib/db/queries/cross-domain-similarity";
import { rankEmbeddingCandidates } from "@/lib/db/queries/embedding-similarity";

const MAX_RELATED = 20;
const YIELD_INTERVAL = 10;

async function buildTagGraph(
  allContent: Array<{ type: string; id: string; tags?: string[] }>,
): Promise<{
  tags: Record<
    string,
    {
      count: number;
      coOccurrences: Record<string, number>;
      contentIds: string[];
      relatedTags: string[];
    }
  >;
  tagHierarchy: Record<string, string[]>;
}> {
  const tagData: Record<
    string,
    {
      count: number;
      coOccurrences: Record<string, number>;
      contentIds: string[];
    }
  > = {};

  for (let i = 0; i < allContent.length; i++) {
    if (i > 0 && i % 20 === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    const content = allContent[i];
    if (!content) continue;
    const contentKey = `${content.type}:${content.id}`;
    const uniqueTags = Array.from(new Set(content.tags || [])).filter(Boolean);
    for (const tag of uniqueTags) {
      if (!tag) continue;

      if (!tagData[tag]) {
        tagData[tag] = { count: 0, coOccurrences: {}, contentIds: [] };
      }

      tagData[tag].count++;
      if (!tagData[tag].contentIds.includes(contentKey)) {
        tagData[tag].contentIds.push(contentKey);
      }

      for (const otherTag of uniqueTags) {
        if (otherTag && tag !== otherTag) {
          tagData[tag].coOccurrences[otherTag] = (tagData[tag].coOccurrences[otherTag] || 0) + 1;
        }
      }
    }
  }

  const tags: Record<
    string,
    {
      count: number;
      coOccurrences: Record<string, number>;
      contentIds: string[];
      relatedTags: string[];
    }
  > = {};
  for (const [tag, data] of Object.entries(tagData)) {
    const relatedTags = Object.entries(data.coOccurrences)
      .toSorted(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([t]) => t);
    tags[tag] = { ...data, relatedTags };
  }

  const tagHierarchy: Record<string, string[]> = {};
  for (const tag of Object.keys(tags)) {
    const parts = tag.split("-");
    if (parts.length > 1 && parts[0]) {
      const parent = parts[0];
      (tagHierarchy[parent] ||= []).push(tag);
    }
  }

  return { tags, tagHierarchy };
}

async function persistContentGraphArtifacts(
  artifacts: Array<{
    artifactType: (typeof CONTENT_GRAPH_ARTIFACT_TYPES)[number];
    payload: Record<string, unknown>;
  }>,
): Promise<void> {
  const { writeContentGraphArtifacts } = await import("@/lib/db/mutations/content-graph");
  await writeContentGraphArtifacts(artifacts);
}

/**
 * Build the content graph using pgvector cosine similarity.
 *
 * For each entity with an embedding, finds nearest neighbors via single-query
 * HNSW traversal and applies blended scoring (cosine + recency + diversity).
 */
export async function buildContentGraph(
  config: DataFetchConfig,
): Promise<DataFetchOperationSummary> {
  const startTime = getMonotonicTime();
  void config;
  logger.info("[ContentGraph] Starting content graph build...");

  try {
    const { db } = await import("@/lib/db/connection");
    const { sql } = await import("drizzle-orm");
    const { getAllPostsMeta } = await import("@/lib/blog");
    const { projects } = await import("@/data/projects");
    const bookmarkQualityRows = await db.execute<{
      id: string;
      has_description: boolean;
      is_favorite: boolean;
      has_word_count: boolean;
    }>(sql`
      SELECT
        id,
        (coalesce(description, '') <> '') AS has_description,
        is_favorite,
        (coalesce(word_count, 0) > 0) AS has_word_count
      FROM bookmarks
    `);
    const bookmarkQualityById = new Map(
      bookmarkQualityRows.map((row) => [
        row.id,
        {
          hasDescription: row.has_description,
          isFavorite: row.is_favorite,
          hasWordCount: row.has_word_count,
        },
      ]),
    );

    // Read all entities that have embeddings
    const embeddingRows = await db.execute<{
      domain: string;
      entity_id: string;
      title: string;
      content_date: string | null;
    }>(sql`
      SELECT domain, entity_id, title, content_date
      FROM embeddings
      WHERE qwen_4b_fp16_embedding IS NOT NULL
      ORDER BY domain, entity_id
    `);

    let entities = [...embeddingRows];
    if (typeof config.testLimit === "number" && config.testLimit > 0) {
      entities = entities.slice(0, config.testLimit);
    }

    if (entities.length === 0) {
      logger.info("[ContentGraph] No entities with embeddings, skipping graph build");
      return {
        success: true,
        operation: "content-graph",
        itemsProcessed: 0,
        duration: (getMonotonicTime() - startTime) / 1000,
      };
    }

    logger.info(`[ContentGraph] Computing similarity for ${entities.length} entities...`);

    const relatedContentMappings: Record<
      string,
      Array<{ type: string; id: string; score: number; title: string }>
    > = {};

    for (let i = 0; i < entities.length; i++) {
      if (i > 0 && i % YIELD_INTERVAL === 0) {
        await new Promise((resolve) => setImmediate(resolve));
        if (i % 50 === 0) {
          logger.info(`[ContentGraph] Progress: ${i}/${entities.length} entities processed`);
        }
      }

      const entity = entities[i];
      if (!entity) continue;

      const sourceDomain = entity.domain as Parameters<
        typeof findSimilarByEntity
      >[0]["sourceDomain"];
      const contentKey = `${entity.domain}:${entity.entity_id}`;

      const candidates = await findSimilarByEntity({
        sourceDomain,
        sourceId: entity.entity_id,
        limit: MAX_RELATED + 10,
      });
      const scored = rankEmbeddingCandidates({
        sourceDomain,
        candidates,
        bookmarkQualityById,
        maxPerDomain: 5,
        maxTotal: MAX_RELATED,
      });

      relatedContentMappings[contentKey] = scored.map((c) => ({
        type: c.domain,
        id: c.entityId,
        score: c.score,
        title: c.title,
      }));
    }

    // Build tag graph from entities that have tag data
    // Tags come from bookmarks, blog posts, projects, thoughts — query minimally
    const tagContentRows = await db.execute<{
      domain: string;
      entity_id: string;
      tags: string[] | null;
    }>(sql`
      SELECT 'bookmark' AS domain, id AS entity_id, tags::text[]
      FROM bookmarks WHERE tags IS NOT NULL
      UNION ALL
      SELECT 'blog' AS domain, id AS entity_id, tags::text[]
      FROM blog_posts WHERE tags IS NOT NULL
      UNION ALL
      SELECT 'project' AS domain, id AS entity_id, tags::text[]
      FROM projects WHERE tags IS NOT NULL
    `);

    const tagContent = tagContentRows.map((r) => ({
      type: r.domain,
      id: r.entity_id,
      tags: r.tags ?? [],
    }));

    const tagGraph = await buildTagGraph(tagContent);

    logger.info(
      `[ContentGraph] Computed ${Object.keys(relatedContentMappings).length} related content mappings`,
    );

    const blogPosts = await getAllPostsMeta();
    const metadata = {
      version: "2.0.0",
      generated: new Date().toISOString(),
      counts: {
        total: entities.length,
        blogPosts: blogPosts.length,
        projects: projects.length,
        bookmarks: entities.filter((e) => e.domain === "bookmark").length,
      },
    };

    await persistContentGraphArtifacts([
      { artifactType: "related-content", payload: relatedContentMappings },
      { artifactType: "tag-graph", payload: tagGraph },
      { artifactType: "metadata", payload: metadata },
    ]);

    logger.info(`[ContentGraph] Saved tag graph with ${Object.keys(tagGraph.tags).length} tags`);

    const duration = ((getMonotonicTime() - startTime) / 1000).toFixed(2);
    logger.info(`[ContentGraph] Content graph built in ${duration}s`);

    return {
      success: true,
      operation: "content-graph",
      itemsProcessed: entities.length,
      duration: parseFloat(duration),
    };
  } catch (error) {
    logger.error("[ContentGraph] Content graph build failed:", error);
    return {
      success: false,
      operation: "content-graph",
      error: error instanceof Error ? error.message : String(error),
      duration: (getMonotonicTime() - startTime) / 1000,
    };
  }
}
