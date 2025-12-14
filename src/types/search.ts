/**
 * Search Types
 */

import { z } from "zod";
import type { SearchScope, SearchResult, ScoredResult } from "./lib";

// Re-export for convenience so consumers can import directly from "@/types/search"
export type { SearchScope, SearchResult, ScoredResult };

export const VALID_SCOPES = [
  "blog",
  "posts",
  "investments",
  "experience",
  "education",
  "bookmarks",
  "projects",
  "books",
  "thoughts",
  "tags",
] as const;

export interface EducationItem {
  id: string;
  label: string;
  description: string;
  path: string;
}

export interface BookmarkIndexItem {
  id: string;
  title: string;
  description: string;
  tags: string;
  url: string;
  author: string;
  publisher: string;
  slug: string; // REQUIRED for idempotent routing
}

export interface SerializedIndex {
  index: string | Record<string, unknown>; // MiniSearch serialized JSON format
  metadata: {
    itemCount: number;
    buildTime: string;
    version: string;
  };
}

/** Aggregated tag with metadata for tag sub-index search */
export interface AggregatedTag {
  name: string;
  slug: string;
  contentType: "blog" | "bookmarks" | "projects" | "books";
  count: number;
  url: string;
}

export interface AllSerializedIndexes {
  posts: SerializedIndex;
  investments: SerializedIndex;
  experience: SerializedIndex;
  education: SerializedIndex;
  projects: SerializedIndex;
  bookmarks: SerializedIndex;
  books: SerializedIndex;
  buildMetadata: {
    buildTime: string;
    version: string;
    environment: string;
  };
}

// Zod schemas moved from lib/schemas/search.ts
export const searchResultItemSchema = z.object({
  id: z.string().min(1, "Search result ID cannot be empty"),
  type: z.enum(["bookmark", "blog-post", "project", "page", "tag"]),
  title: z.string(),
  description: z.string().optional(),
  url: z.string(),
  score: z.number(),
  highlights: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const searchResultsSchema = z.array(searchResultItemSchema);

/** MiniSearch stored fields shape for index deserialization */
export type MiniSearchStoredFields = {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  url?: unknown;
  slug?: unknown;
};
