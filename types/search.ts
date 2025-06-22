/**
 * Search Types
 */

import { z } from "zod";
import type { SearchScope, SearchResult } from "./lib";

// Re-export for convenience so consumers can import directly from "@/types/search"
export type { SearchScope, SearchResult };

export const VALID_SCOPES = [
  "blog",
  "posts",
  "investments",
  "experience",
  "education",
  "bookmarks",
  "projects",
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
}

// Zod schemas moved from lib/schemas/search.ts
export const searchResultItemSchema = z.object({
  id: z.string(),
  type: z.enum(["bookmark", "blog-post", "project", "page"]),
  title: z.string(),
  description: z.string().optional(),
  url: z.string(),
  score: z.number(),
  highlights: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const searchResultsSchema = z.array(searchResultItemSchema);
