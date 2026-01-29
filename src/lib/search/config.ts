/**
 * Search Index Configurations
 *
 * Centralized MiniSearch configurations for all content types.
 * Eliminates repetitive configuration objects across index builders.
 *
 * @module lib/search/config
 */

import type { IndexFieldConfig, EducationItem, BookmarkIndexItem } from "@/types/search";
import type { Investment } from "@/types/investment";
import type { Experience } from "@/types/experience";
import type { Project } from "@/types/project";
import type { BookListItem } from "@/types/schemas/book";
import type { BlogPost } from "@/types/blog";

/**
 * Investment index configuration
 * @see {@link @/data/investments} for source data
 */
export const INVESTMENTS_INDEX_CONFIG: IndexFieldConfig<Investment> = {
  fields: [
    "name",
    "description",
    "type",
    "status",
    "founded_year",
    "invested_year",
    "acquired_year",
    "shutdown_year",
  ],
  storeFields: ["id", "name", "description"],
  idField: "id",
  boost: { name: 2 },
  fuzzy: 0.1,
};

/**
 * Experience index configuration
 * @see {@link @/data/experience} for source data
 */
export const EXPERIENCE_INDEX_CONFIG: IndexFieldConfig<Experience> = {
  fields: ["company", "role", "period"],
  storeFields: ["id", "company", "role"],
  idField: "id",
  boost: { company: 2, role: 1.5 },
  fuzzy: 0.2,
};

/**
 * Education index configuration
 * Uses EducationItem (transformed from raw education/certification data)
 * @see {@link @/data/education} for source data
 */
export const EDUCATION_INDEX_CONFIG: IndexFieldConfig<EducationItem> = {
  fields: ["label", "description"],
  storeFields: ["id", "label", "description", "path"],
  idField: "id",
  boost: { label: 2 },
  fuzzy: 0.2,
};

/**
 * Projects index configuration
 * Note: Uses 'name' as idField since projects are identified by name
 * @see {@link @/data/projects} for source data
 */
export const PROJECTS_INDEX_CONFIG: IndexFieldConfig<Project> = {
  fields: ["name", "description", "tags"],
  storeFields: ["name", "description", "url"],
  idField: "name",
  boost: { name: 2 },
  fuzzy: 0.2,
};

/**
 * Bookmarks index configuration
 * @see {@link @/lib/bookmarks/service.server} for source data
 */
export const BOOKMARKS_INDEX_CONFIG: IndexFieldConfig<BookmarkIndexItem> = {
  fields: ["title", "description", "tags", "author", "publisher", "url", "slug"],
  storeFields: ["id", "title", "description", "url", "slug"],
  idField: "id",
  boost: { title: 2, description: 1.5 },
  fuzzy: 0.2,
};

/**
 * Books index configuration
 * Note: Has custom extractField for handling authors array
 * Uses BookListItem (minimal type) since index-builder fetches list items
 * @see {@link @/lib/books/audiobookshelf.server} for source data
 */
export const BOOKS_INDEX_CONFIG: IndexFieldConfig<BookListItem> = {
  fields: ["title", "authors"],
  storeFields: ["id", "title", "authors", "coverUrl"],
  idField: "id",
  boost: { title: 2 },
  fuzzy: 0.2,
  extractField: (document: BookListItem, fieldName: string): string => {
    // CRITICAL: MiniSearch uses extractField for ALL fields including the ID field.
    // We must return the actual ID, not an empty string, or all docs get duplicate ID "".
    if (fieldName === "id") {
      return document.id;
    }
    // authors is string[] - join for MiniSearch text indexing
    if (fieldName === "authors") {
      return Array.isArray(document.authors) ? document.authors.join(" ") : "";
    }
    if (fieldName === "title") {
      return typeof document.title === "string" ? document.title : "";
    }
    return "";
  },
};

/**
 * Blog posts index configuration
 * Note: Uses 'slug' as idField and has custom extractField for author and tags
 * @see {@link @/lib/blog/mdx} for source data
 */
export const POSTS_INDEX_CONFIG: IndexFieldConfig<BlogPost, "authorName"> = {
  fields: ["title", "excerpt", "tags", "authorName"],
  storeFields: ["id", "title", "excerpt", "slug", "publishedAt"],
  idField: "slug",
  boost: { title: 2 },
  fuzzy: 0.1,
  extractField: (document: BlogPost, fieldName: string): string => {
    if (fieldName === "authorName") {
      return document.author?.name || "";
    }
    if (fieldName === "tags") {
      return Array.isArray(document.tags) ? document.tags.join(" ") : "";
    }
    const field = fieldName as keyof BlogPost;
    const value = document[field];
    return typeof value === "string" ? value : "";
  },
};
