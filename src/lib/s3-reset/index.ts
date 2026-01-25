/**
 * S3 Reset Utilities
 *
 * Factory functions and configuration for the S3 reset/regeneration script.
 * Centralizes category configuration and provides DRY utilities for file categorization.
 */

import {
  BOOKMARKS_S3_PATHS,
  GITHUB_ACTIVITY_S3_PATHS,
  SEARCH_S3_PATHS,
  CONTENT_GRAPH_S3_PATHS,
  CONTENT_GRAPH_BASE_PREFIX,
  IMAGE_MANIFEST_S3_PATHS,
  OPENGRAPH_JSON_S3_PATHS,
  RATE_LIMIT_S3_PATHS,
  LOCKS_S3_PATHS,
} from "@/lib/constants";
import type { DeletionStats, RegenerationStats, CategoryKey, CategoryName } from "@/types/s3-reset";

/**
 * Category configuration with path-matching functions.
 * Single source of truth for mapping S3 files to categories.
 */
export const CATEGORY_CONFIG: Record<
  CategoryKey,
  {
    name: CategoryName | "Logos";
    paths: readonly string[];
    matchesFile: (file: string) => boolean;
    regenerate: boolean;
  }
> = {
  bookmarks: {
    name: "Bookmarks",
    paths: [BOOKMARKS_S3_PATHS.DIR + "/"],
    matchesFile: (file: string) => file.startsWith(BOOKMARKS_S3_PATHS.DIR),
    regenerate: true,
  },
  github: {
    name: "GitHub Activity",
    paths: [GITHUB_ACTIVITY_S3_PATHS.DIR + "/"],
    matchesFile: (file: string) => file.startsWith(GITHUB_ACTIVITY_S3_PATHS.DIR),
    regenerate: true,
  },
  search: {
    name: "Search Indexes",
    paths: [SEARCH_S3_PATHS.DIR + "/"],
    matchesFile: (file: string) => file.startsWith(SEARCH_S3_PATHS.DIR),
    regenerate: true,
  },
  content: {
    name: "Content Graph",
    paths: [CONTENT_GRAPH_S3_PATHS.DIR + "/", CONTENT_GRAPH_BASE_PREFIX + "/"],
    // Content graph uses startsWith for env-specific OR includes base prefix for stray files
    matchesFile: (file: string) =>
      file.startsWith(CONTENT_GRAPH_S3_PATHS.DIR) || file.includes(CONTENT_GRAPH_BASE_PREFIX),
    regenerate: true,
  },
  images: {
    name: "Image Manifests",
    paths: [IMAGE_MANIFEST_S3_PATHS.DIR + "/"],
    matchesFile: (file: string) => file.startsWith(IMAGE_MANIFEST_S3_PATHS.DIR),
    regenerate: false, // Handled by logos
  },
  opengraph: {
    name: "OpenGraph",
    paths: [OPENGRAPH_JSON_S3_PATHS.DIR + "/"],
    matchesFile: (file: string) => file.startsWith(OPENGRAPH_JSON_S3_PATHS.DIR),
    regenerate: false, // Regenerated with bookmarks
  },
  ratelimit: {
    name: "Rate Limiting",
    paths: [RATE_LIMIT_S3_PATHS.DIR + "/"],
    matchesFile: (file: string) => file.startsWith(RATE_LIMIT_S3_PATHS.DIR),
    regenerate: false, // Will be recreated as needed
  },
  locks: {
    name: "Locks",
    paths: [LOCKS_S3_PATHS.DIR + "/"],
    matchesFile: (file: string) => file.startsWith(LOCKS_S3_PATHS.DIR),
    regenerate: false, // Will be recreated as needed
  },
  logos: {
    name: "Logos",
    paths: [], // Logos are in image manifests
    matchesFile: () => false, // No direct file matching
    regenerate: true,
  },
} as const;

/**
 * Get the category key for a given S3 file path.
 * Returns null if the file doesn't match any known category.
 */
export function getCategoryForFile(file: string): CategoryKey | null {
  for (const [key, config] of Object.entries(CATEGORY_CONFIG)) {
    if (config.matchesFile(file)) {
      return key as CategoryKey;
    }
  }
  return null;
}

/**
 * Get the display name for a file's category.
 * Returns "Other" for files that don't match any category.
 */
export function getCategoryNameForFile(file: string): CategoryName {
  const category = getCategoryForFile(file);
  if (category && category !== "logos") {
    return CATEGORY_CONFIG[category].name as CategoryName;
  }
  return "Other";
}

/**
 * Categorize a list of files into buckets by category name.
 * Returns a record with all category names as keys and arrays of matching files.
 */
export function categorizeFiles(files: string[]): Record<CategoryName, string[]> {
  const result: Record<CategoryName, string[]> = {
    Bookmarks: [],
    "GitHub Activity": [],
    "Search Indexes": [],
    "Content Graph": [],
    "Image Manifests": [],
    OpenGraph: [],
    "Rate Limiting": [],
    Locks: [],
    Other: [],
  };

  for (const file of files) {
    const categoryName = getCategoryNameForFile(file);
    result[categoryName].push(file);
  }

  return result;
}

/**
 * Create an empty DeletionStats object with default values.
 */
export function createEmptyDeletionStats(): DeletionStats {
  return {
    totalFiles: 0,
    deletedFiles: 0,
    failedFiles: 0,
    skippedFiles: 0,
    errors: [],
  };
}

/**
 * Create an empty RegenerationStats object with default values.
 */
export function createEmptyRegenerationStats(): RegenerationStats {
  return {
    bookmarks: { success: false, count: 0 },
    slugMappings: { success: false, count: 0 },
    github: { success: false, count: 0 },
    search: { success: false, count: 0 },
    contentGraph: { success: false, count: 0 },
    logos: { success: false, count: 0 },
  };
}

/**
 * Create an empty files-by-category record with all category keys initialized.
 */
export function createEmptyFilesByCategory(): Record<CategoryName, string[]> {
  return {
    Bookmarks: [],
    "GitHub Activity": [],
    "Search Indexes": [],
    "Content Graph": [],
    "Image Manifests": [],
    OpenGraph: [],
    "Rate Limiting": [],
    Locks: [],
    Other: [],
  };
}
