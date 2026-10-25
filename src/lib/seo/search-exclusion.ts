/**
 * Search Exclusion Policy
 * @module lib/seo/search-exclusion
 * @description
 * Robots directive for routes people browse but search engines must not index.
 * Bookmark, bookmark tag, blog tag and book pages mostly repeat third-party
 * titles, descriptions and AI summaries, or only list other pages; thousands of
 * them indexed beside a few dozen original posts read as a site of scaled,
 * low-value content. `follow` keeps their links crawlable. `src/app/sitemap.ts`
 * omits the same routes.
 */

import type { Metadata } from "next";

export const SEARCH_EXCLUDED_ROBOTS: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: true,
};
