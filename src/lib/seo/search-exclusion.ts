/**
 * Search Exclusion Policy
 * @module lib/seo/search-exclusion
 * @description
 * Robots directive for routes people browse but search engines must not index.
 * Ungraduated bookmark detail pages, thin or paginated bookmark tag pages,
 * blog tag pages and book detail pages use SEARCH_EXCLUDED_ROBOTS. `follow`
 * keeps their links crawlable without indexing third-party-derived content.
 * Canonical bookmark topic hubs and substantive annotated bookmarks graduate
 * through `src/lib/seo/bookmark-seo-policy.ts` and `/bookmarks-sitemap.xml`.
 */

import type { Metadata } from "next";

export const SEARCH_EXCLUDED_ROBOTS: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: true,
};
