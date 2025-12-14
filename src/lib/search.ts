/**
 * Search Utilities
 *
 * @deprecated Import from '@/lib/search' (the directory) instead.
 * This file is kept for backward compatibility.
 *
 * @module lib/search
 */

// Re-export all public APIs from the new modular structure
export {
  // Search functions
  searchInvestments,
  searchExperience,
  searchEducation,
  searchProjects,
  searchBookmarks,
  searchBooks,
  searchTags,
  searchThoughts,
  // Cache invalidation
  invalidateSearchCache,
  invalidateSearchQueryCache,
  // Index building
  buildAllSearchIndexes,
  loadIndexFromJSON,
  // Types
  type SearchResult,
  type AggregatedTag,
  type SerializedIndex,
  type AllSerializedIndexes,
} from "./search/index";
