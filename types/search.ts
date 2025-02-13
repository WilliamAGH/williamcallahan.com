/**
 * Search Types
 */

export type SearchFunction = (query: string) => Promise<SearchResult[]>;

export interface SearchResult {
  label: string;
  value: string;
  action: "navigate";
  path: string;
}