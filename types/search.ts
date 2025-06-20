/**
 * Search Types
 */

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
