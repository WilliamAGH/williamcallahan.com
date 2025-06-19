/**
 * Search Types
 */

export interface SearchResult {
  label: string;
  description: string;
  path: string;
}

export const VALID_SCOPES = ["blog", "posts", "investments", "experience", "education", "bookmarks"] as const;

export type SearchScope = (typeof VALID_SCOPES)[number];

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
  content?: {
    author?: string | null;
    publisher?: string | null;
  };
}
