/**
 * Sitemap Constants
 * @module lib/sitemap/constants
 * @description
 * Shared constants for sitemap generation: change frequencies, priorities,
 * cache TTL, and tag lookup budget.
 */

import type { MetadataRoute } from "next";

export const BOOKMARK_CHANGE_FREQUENCY: NonNullable<
  MetadataRoute.Sitemap[number]["changeFrequency"]
> = "weekly";
export const BOOKMARK_PRIORITY = 0.65;
export const BOOKMARK_TAG_PRIORITY = 0.6;
export const BOOKMARK_TAG_PAGE_PRIORITY = 0.55;
export const BOOK_CHANGE_FREQUENCY: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]> =
  "monthly";
export const BOOK_PRIORITY = 0.6;
export const THOUGHT_CHANGE_FREQUENCY: NonNullable<
  MetadataRoute.Sitemap[number]["changeFrequency"]
> = "weekly";
export const THOUGHT_PRIORITY = 0.6;
export const BLOG_CHANGE_FREQUENCY: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]> =
  "weekly";
export const BLOG_POST_PRIORITY = 0.7;
export const BLOG_TAG_PRIORITY = 0.6;
export const SITEMAP_RUNTIME_CACHE_TTL_MS = 10 * 60 * 1000;
export const TAG_INDEX_LOOKUP_BUDGET = 200;

// Static Pages
export const STATIC_CHANGE_FREQUENCY: NonNullable<
  MetadataRoute.Sitemap[number]["changeFrequency"]
> = "monthly";
export const STATIC_PRIORITY_HOME = 1.0;
export const STATIC_PRIORITY_HIGH = 0.9; // Projects, Blog index
export const STATIC_PRIORITY_MEDIUM = 0.85; // CV
export const STATIC_PRIORITY_STANDARD = 0.8; // Experience, Contact
export const STATIC_PRIORITY_LOW = 0.7; // Education, Bookmarks index

// Project Tags
export const PROJECT_TAG_CHANGE_FREQUENCY: NonNullable<
  MetadataRoute.Sitemap[number]["changeFrequency"]
> = "weekly";
export const PROJECT_TAG_PRIORITY = 0.6;
