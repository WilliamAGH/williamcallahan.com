/**
 * Search Index Builder
 *
 * Builds and serializes MiniSearch indexes for storage in S3.
 * This is run at build time to pre-generate search indexes,
 * avoiding the need to build them on every request.
 *
 * @module lib/search/index-builder
 */

import { assertServerOnly } from "../utils/ensure-server-only";
assertServerOnly();

import MiniSearch from "minisearch";
import type {
  EducationItem,
  BookmarkIndexItem,
  SerializedIndex,
  AllSerializedIndexes,
  IndexFieldConfig,
} from "@/types/search";
import type { Project } from "@/types/project";
import type { UnifiedBookmark } from "@/types/bookmark";
import { investments } from "@/data/investments";
import { experiences } from "@/data/experience";
import { education, certifications } from "@/data/education";
import { projects } from "@/data/projects";
import { getAllMDXPostsForSearch } from "@/lib/blog/mdx";
import { getBookmarks } from "@/lib/bookmarks/bookmarks-data-access.server";
import { fetchBookListItems } from "@/lib/books/audiobookshelf.server";
import { prepareDocumentsForIndexing } from "@/lib/utils/search-helpers";
import { loadSlugMapping, getSlugForBookmark } from "@/lib/bookmarks/slug-manager";
import { tryGetEmbeddedSlug } from "@/lib/bookmarks/slug-helpers";
import { serializeIndex, isRecord } from "./serialization";
import {
  POSTS_INDEX_CONFIG,
  INVESTMENTS_INDEX_CONFIG,
  EXPERIENCE_INDEX_CONFIG,
  EDUCATION_INDEX_CONFIG,
  PROJECTS_INDEX_CONFIG,
  BOOKMARKS_INDEX_CONFIG,
  BOOKS_INDEX_CONFIG,
} from "./config";

/**
 * Creates an empty MiniSearch instance from a config.
 * Used by index-builder to create indexes before adding transformed documents.
 */
function createEmptyIndex<T, VF extends string = never>(config: IndexFieldConfig<T, VF>): MiniSearch<T> {
  return new MiniSearch<T>({
    fields: config.fields as string[],
    storeFields: config.storeFields,
    idField: config.idField,
    searchOptions: {
      boost: config.boost as { [fieldName: string]: number } | undefined,
      fuzzy: config.fuzzy,
      prefix: true,
    },
    extractField: config.extractField,
  });
}

/**
 * Build search index for blog posts
 */
async function buildPostsIndex(): Promise<SerializedIndex> {
  const allPosts = await getAllMDXPostsForSearch();
  const index = createEmptyIndex(POSTS_INDEX_CONFIG);
  const dedupedPosts = prepareDocumentsForIndexing(allPosts, "Blog Posts", post => post.slug);
  index.addAll(dedupedPosts);
  return serializeIndex(index, dedupedPosts.length);
}

/**
 * Build search index for investments
 */
function buildInvestmentsIndex(): SerializedIndex {
  const index = createEmptyIndex(INVESTMENTS_INDEX_CONFIG);
  const dedupedInvestments = prepareDocumentsForIndexing(investments, "Investments");
  index.addAll(dedupedInvestments);
  return serializeIndex(index, dedupedInvestments.length);
}

/**
 * Build search index for experience
 */
function buildExperienceIndex(): SerializedIndex {
  const index = createEmptyIndex(EXPERIENCE_INDEX_CONFIG);
  const dedupedExperiences = prepareDocumentsForIndexing(experiences, "Experience");
  index.addAll(dedupedExperiences);
  return serializeIndex(index, dedupedExperiences.length);
}

/**
 * Build search index for education
 */
function buildEducationIndex(): SerializedIndex {
  const index = createEmptyIndex(EDUCATION_INDEX_CONFIG);

  // Combine education and certifications
  const allEducationItems: EducationItem[] = [
    ...education.map(edu => ({
      id: edu.id,
      label: edu.institution,
      description: edu.degree,
      path: `/education#${edu.id}`,
    })),
    ...certifications.map(cert => ({
      id: cert.id,
      label: cert.institution,
      description: cert.name,
      path: `/education#${cert.id}`,
    })),
  ];

  const dedupedEducationItems = prepareDocumentsForIndexing(allEducationItems, "Education");
  index.addAll(dedupedEducationItems);
  return serializeIndex(index, dedupedEducationItems.length);
}

/**
 * Build search index for projects
 */
function buildProjectsIndexForBuilder(): SerializedIndex {
  const index = createEmptyIndex(PROJECTS_INDEX_CONFIG);
  const dedupedProjects: Project[] = prepareDocumentsForIndexing(
    projects as Array<Project & { id?: string | number }>,
    "Projects",
    p => p.name,
  );
  index.addAll(dedupedProjects);
  return serializeIndex(index, dedupedProjects.length);
}

/**
 * Build search index for bookmarks
 */
async function buildBookmarksIndex(): Promise<SerializedIndex> {
  const maybeBookmarks = await getBookmarks({ skipExternalFetch: false });
  if (!Array.isArray(maybeBookmarks)) {
    throw new Error("[Search Index Builder] Unexpected bookmarks payload");
  }
  const bookmarks = maybeBookmarks as UnifiedBookmark[];

  const index = createEmptyIndex(BOOKMARKS_INDEX_CONFIG);
  const slugMapping = await loadSlugMapping();

  // Transform bookmarks for indexing with slug resolution
  const bookmarksForIndex: BookmarkIndexItem[] = bookmarks.map(b => {
    const embedded = tryGetEmbeddedSlug(b);
    const slug = embedded ?? (slugMapping ? getSlugForBookmark(slugMapping, b.id) : null);

    if (!slug) {
      throw new Error(
        `[Search Index Builder] CRITICAL: No slug found for bookmark ${b.id}. ` +
          `Title: ${b.title}, URL: ${b.url}. ` +
          `This indicates an incomplete slug mapping.`,
      );
    }

    return {
      id: b.id,
      title: b.title || b.url,
      description: b.description || "",
      tags: Array.isArray(b.tags)
        ? b.tags.map(t => (typeof t === "string" ? t : (t as { name?: string })?.name || "")).join("\n")
        : "",
      url: b.url,
      author: b.content?.author || "",
      publisher: b.content?.publisher || "",
      slug,
    };
  });

  index.addAll(bookmarksForIndex);
  return serializeIndex(index, bookmarksForIndex.length);
}

/**
 * Build search index for books (from AudioBookShelf)
 */
async function buildBooksIndex(): Promise<SerializedIndex> {
  const books = await fetchBookListItems();
  const index = createEmptyIndex(BOOKS_INDEX_CONFIG);
  const dedupedBooks = prepareDocumentsForIndexing(books, "Books");
  index.addAll(dedupedBooks);
  return serializeIndex(index, dedupedBooks.length);
}

/**
 * Build all search indexes
 */
export async function buildAllSearchIndexes(): Promise<AllSerializedIndexes> {
  console.log("[Search Index Builder] Starting build process...");

  const [postsIndex, bookmarksIndex, booksIndex] = await Promise.all([
    buildPostsIndex(),
    buildBookmarksIndex(),
    buildBooksIndex(),
  ]);

  const investmentsIndex = buildInvestmentsIndex();
  const experienceIndex = buildExperienceIndex();
  const educationIndex = buildEducationIndex();
  const projectsIndex = buildProjectsIndexForBuilder();

  const buildMetadata = {
    buildTime: new Date().toISOString(),
    version: process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0",
    environment: process.env.NODE_ENV || "development",
  };

  console.log("[Search Index Builder] Build complete. Index counts:");
  console.log(`  - Posts: ${postsIndex.metadata.itemCount}`);
  console.log(`  - Investments: ${investmentsIndex.metadata.itemCount}`);
  console.log(`  - Experience: ${experienceIndex.metadata.itemCount}`);
  console.log(`  - Education: ${educationIndex.metadata.itemCount}`);
  console.log(`  - Projects: ${projectsIndex.metadata.itemCount}`);
  console.log(`  - Bookmarks: ${bookmarksIndex.metadata.itemCount}`);
  console.log(`  - Books: ${booksIndex.metadata.itemCount}`);

  return {
    posts: postsIndex,
    investments: investmentsIndex,
    experience: experienceIndex,
    education: educationIndex,
    projects: projectsIndex,
    bookmarks: bookmarksIndex,
    books: booksIndex,
    buildMetadata,
  };
}

/**
 * Load a MiniSearch index from serialized JSON
 *
 * Handles both string and object formats for the index:
 * - When stored to S3, the index is JSON stringified
 * - When read back from S3, it's parsed into an object
 * - MiniSearch.loadJSON expects a JSON string, not a parsed object
 */
export function loadIndexFromJSON<T>(serializedIndex: SerializedIndex): MiniSearch<T> {
  const indexData =
    typeof serializedIndex.index === "string" ? serializedIndex.index : JSON.stringify(serializedIndex.index);
  const { fields, storeFields } = extractFieldsFromSerializedIndex(serializedIndex);

  return MiniSearch.loadJSON(indexData, {
    fields,
    storeFields,
  });
}

function extractFieldsFromSerializedIndex(serializedIndex: SerializedIndex): {
  fields: string[];
  storeFields: string[];
} {
  const raw = typeof serializedIndex.index === "string" ? safeParseIndex(serializedIndex.index) : serializedIndex.index;

  if (!isRecord(raw)) {
    return { fields: [], storeFields: [] };
  }

  const fields = isRecord(raw.fieldIds) ? Object.keys(raw.fieldIds) : [];

  let storeFields: string[] = [];
  if (isRecord(raw.storedFields)) {
    const storedValues = Object.values(raw.storedFields);
    for (const value of storedValues) {
      if (isRecord(value)) {
        storeFields = Object.keys(value);
        if (storeFields.length > 0) break;
      }
    }
  }

  return { fields, storeFields };
}

function safeParseIndex(index: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(index) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
