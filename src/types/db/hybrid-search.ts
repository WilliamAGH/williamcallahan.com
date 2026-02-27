/**
 * Result types for domain-specific hybrid search queries.
 *
 * Each interface corresponds to a hybrid search function in
 * `src/lib/db/queries/hybrid-search-*.ts`.
 */

export interface InvestmentSearchResult {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string | null;
  stage: string;
  status: string;
  operatingStatus: string;
  location: string | null;
  score: number;
}

export interface ProjectSearchResult {
  id: string;
  name: string;
  slug: string;
  description: string;
  shortSummary: string;
  url: string;
  imageKey: string;
  tags: string[] | null;
  score: number;
}

export interface BookSearchResult {
  id: string;
  title: string;
  slug: string;
  authors: string[] | null;
  description: string | null;
  coverUrl: string | null;
  score: number;
}

export interface BlogPostSearchResult {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  authorName: string;
  tags: string[] | null;
  publishedAt: string;
  score: number;
}
