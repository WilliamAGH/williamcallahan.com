/**
 * Search Module
 *
 * Main entry point for all search functionality.
 * Re-exports all public APIs from specialized modules.
 *
 * @module lib/search
 */

// Search functions for different content types
export {
  searchInvestments,
  searchExperience,
  searchEducation,
  searchProjects,
} from "./searchers/static-searchers";

export { searchBookmarks, searchBooks } from "./searchers/dynamic-searchers";

export { searchTags } from "./searchers/tag-search";
export { searchAiAnalysis } from "./searchers/ai-analysis-searcher";
export { searchThoughts } from "./searchers/thoughts-search";

// Cache invalidation
export { invalidateSearchCache, invalidateSearchQueryCache } from "./cache-invalidation";

// Index building (for build-time scripts)
export { buildAllSearchIndexes, loadIndexFromJSON } from "./index-builder";

// Re-export key types for consumers
export type {
  SearchResult,
  AggregatedTag,
  SerializedIndex,
  AllSerializedIndexes,
} from "@/types/search";
