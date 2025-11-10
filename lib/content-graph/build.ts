import logger from "@/lib/utils/logger";
import { writeJsonS3 } from "@/lib/s3-utils";
import { CONTENT_GRAPH_S3_PATHS } from "@/lib/constants";
import type { DataFetchConfig, DataFetchOperationSummary } from "@/types/lib";

// This function was moved from DataFetchManager
async function buildTagGraph(allContent: Array<{ type: string; id: string; tags?: string[] }>): Promise<{
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

  // Process each content item's tags
  for (let i = 0; i < allContent.length; i++) {
    // Yield control periodically to prevent blocking
    if (i > 0 && i % 20 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }

    const content = allContent[i];
    if (!content) continue; // Safety check for TypeScript
    const contentKey = `${content.type}:${content.id}`;
    const uniqueTags = Array.from(new Set(content.tags || [])).filter(Boolean);
    for (const tag of uniqueTags) {
      if (!tag) continue; // Skip empty tags

      // Initialize tag data if needed
      if (!tagData[tag]) {
        tagData[tag] = {
          count: 0,
          coOccurrences: {},
          contentIds: [],
        };
      }

      tagData[tag].count++;
      if (!tagData[tag].contentIds.includes(contentKey)) {
        tagData[tag].contentIds.push(contentKey);
      }

      // Track co-occurrences with other tags
      for (const otherTag of uniqueTags) {
        if (otherTag && tag !== otherTag) {
          tagData[tag].coOccurrences[otherTag] = (tagData[tag].coOccurrences[otherTag] || 0) + 1;
        }
      }
    }
  }

  // Build final tag graph
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
    // Find most related tags based on co-occurrence
    const relatedTags = Object.entries(data.coOccurrences)
      .toSorted(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([tag]) => tag);

    tags[tag] = {
      ...data,
      relatedTags,
    };
  }

  // Build simple tag hierarchy based on patterns
  const tagHierarchy: Record<string, string[]> = {};
  for (const tag of Object.keys(tags)) {
    const parts = tag.split("-");
    if (parts.length > 1 && parts[0]) {
      const parent = parts[0];
      if (!tagHierarchy[parent]) {
        tagHierarchy[parent] = [];
      }
      tagHierarchy[parent].push(tag);
    }
  }

  return { tags, tagHierarchy };
}

// This function was moved from DataFetchManager
export async function buildContentGraph(config: DataFetchConfig): Promise<DataFetchOperationSummary> {
  const startTime = Date.now();
  void config; // Mark as acknowledged per project convention
  logger.info("[DataFetchManager] Starting content graph build...");

  try {
    // Import required modules dynamically to avoid circular dependencies
    const { aggregateAllContent } = await import("@/lib/content-similarity/aggregator");
    const { findMostSimilar, DEFAULT_WEIGHTS } = await import("@/lib/content-similarity");
    const { getAllPosts } = await import("@/lib/blog");
    const { projects } = await import("@/data/projects");

    // Aggregate all content
    logger.info("[DataFetchManager] Aggregating all content for graph...");
    let allContent = await aggregateAllContent();
    if (typeof config.testLimit === "number" && config.testLimit > 0) {
      allContent = allContent.slice(0, config.testLimit);
    }
    const blogPosts = await getAllPosts();
    const projectsData = projects;

    // Early return if no content to process
    if (allContent.length === 0) {
      logger.info("[DataFetchManager] No content to process, skipping graph build");
      return {
        success: true,
        operation: "content-graph",
        itemsProcessed: 0,
        duration: (Date.now() - startTime) / 1000,
      };
    }

    // Pre-compute related content for every item
    logger.info("[DataFetchManager] Computing similarity scores for all content...");
    const relatedContentMappings: Record<
      string,
      Array<{
        type: string;
        id: string;
        score: number;
        title: string;
      }>
    > = {};
    const MAX_RELATED = 20; // Store top 20 for each item
    const YIELD_INTERVAL = 10; // Yield control every 10 items to prevent blocking

    for (let i = 0; i < allContent.length; i++) {
      // Yield control periodically to allow HTTP requests to be processed
      if (i > 0 && i % YIELD_INTERVAL === 0) {
        await new Promise(resolve => setImmediate(resolve));

        // Log progress for visibility
        if (i % 50 === 0) {
          logger.info(`[DataFetchManager] Content graph progress: ${i}/${allContent.length} items processed`);
        }
      }

      const sourceContent = allContent[i];
      if (!sourceContent) continue; // Safety check for TypeScript
      const contentKey = `${sourceContent.type}:${sourceContent.id}`;

      // Find similar content (excluding self)
      const candidates = allContent.filter(item => !(item.type === sourceContent.type && item.id === sourceContent.id));

      const similar = findMostSimilar(sourceContent, candidates, MAX_RELATED, DEFAULT_WEIGHTS);

      // Store with minimal data needed for hydration
      // Note: Bookmark slugs will be resolved at render time using slug mappings
      // to ensure consistency and avoid hydration issues
      relatedContentMappings[contentKey] = similar.map(item => ({
        type: item.type,
        id: item.id,
        score: item.score,
        title: item.title,
      }));
    }

    // Build tag co-occurrence graph while saving related content
    const [tagGraph] = await Promise.all([
      buildTagGraph(allContent),
      writeJsonS3(CONTENT_GRAPH_S3_PATHS.RELATED_CONTENT, relatedContentMappings),
    ]);
    logger.info(`[DataFetchManager] Saved ${Object.keys(relatedContentMappings).length} related content mappings`);

    // Save metadata
    const metadata = {
      version: "1.0.0",
      generated: new Date().toISOString(),
      counts: {
        total: allContent.length,
        blogPosts: blogPosts.length,
        projects: projectsData.length,
        bookmarks: allContent.filter(c => c.type === "bookmark").length,
      },
    };

    // Batch write tag graph and metadata to S3
    await Promise.all([
      writeJsonS3(CONTENT_GRAPH_S3_PATHS.TAG_GRAPH, tagGraph),
      writeJsonS3(CONTENT_GRAPH_S3_PATHS.METADATA, metadata),
    ]);
    logger.info(`[DataFetchManager] Saved tag graph with ${Object.keys(tagGraph.tags).length} tags`);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(`[DataFetchManager] Content graph built in ${duration}s`);

    return {
      success: true,
      operation: "content-graph",
      itemsProcessed: allContent.length,
      duration: parseFloat(duration),
    };
  } catch (error) {
    logger.error("[DataFetchManager] Content graph build failed:", error);
    return {
      success: false,
      operation: "content-graph",
      error: error instanceof Error ? error.message : String(error),
      duration: (Date.now() - startTime) / 1000,
    };
  }
}
