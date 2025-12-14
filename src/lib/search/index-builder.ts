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
import type { BlogPost } from "@/types/blog";
import type { EducationItem, BookmarkIndexItem, SerializedIndex, AllSerializedIndexes } from "@/types/search";
import { investments } from "@/data/investments";
import { experiences } from "@/data/experience";
import { education, certifications } from "@/data/education";
import { projects } from "@/data/projects";
import type { Project } from "@/types/project";
import { getAllMDXPostsForSearch } from "@/lib/blog/mdx";
import { getBookmarks } from "@/lib/bookmarks/bookmarks-data-access.server";
import { fetchBookListItems } from "@/lib/books/audiobookshelf.server";
import type { BookListItem } from "@/types/schemas/book";
import { prepareDocumentsForIndexing } from "@/lib/utils/search-helpers";
import { loadSlugMapping, getSlugForBookmark } from "@/lib/bookmarks/slug-manager";
import { tryGetEmbeddedSlug } from "@/lib/bookmarks/slug-helpers";
import type { UnifiedBookmark } from "@/types/bookmark";

/**
 * Build search index for blog posts
 */
async function buildPostsIndex(): Promise<SerializedIndex> {
  // Get lightweight posts without rawContent
  const allPosts = await getAllMDXPostsForSearch();

  // Create MiniSearch index
  const index = new MiniSearch<BlogPost>({
    fields: ["title", "excerpt", "tags", "authorName"],
    storeFields: ["id", "title", "excerpt", "slug", "publishedAt"],
    idField: "slug",
    searchOptions: {
      boost: { title: 2 },
      fuzzy: 0.1,
      prefix: true,
    },
    extractField: (document, fieldName) => {
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
  });

  // Deduplicate and add to index
  const dedupedPosts = prepareDocumentsForIndexing(allPosts, "Blog Posts", post => post.slug);
  index.addAll(dedupedPosts);

  return {
    index: index.toJSON(),
    metadata: {
      itemCount: dedupedPosts.length,
      buildTime: new Date().toISOString(),
      version: "1.0",
    },
  };
}

/**
 * Build search index for investments
 */
function buildInvestmentsIndex(): SerializedIndex {
  const index = new MiniSearch<(typeof investments)[0]>({
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
    searchOptions: {
      boost: { name: 2 },
      fuzzy: 0.1,
      prefix: true,
    },
  });

  const dedupedInvestments = prepareDocumentsForIndexing(investments, "Investments");
  index.addAll(dedupedInvestments);

  return {
    index: index.toJSON(),
    metadata: {
      itemCount: dedupedInvestments.length,
      buildTime: new Date().toISOString(),
      version: "1.0",
    },
  };
}

/**
 * Build search index for experience
 */
function buildExperienceIndex(): SerializedIndex {
  const index = new MiniSearch<(typeof experiences)[0]>({
    fields: ["company", "role", "period"],
    storeFields: ["id", "company", "role"],
    idField: "id",
    searchOptions: {
      boost: { company: 2, role: 1.5 },
      fuzzy: 0.2,
      prefix: true,
    },
  });

  const dedupedExperiences = prepareDocumentsForIndexing(experiences, "Experience");
  index.addAll(dedupedExperiences);

  return {
    index: index.toJSON(),
    metadata: {
      itemCount: dedupedExperiences.length,
      buildTime: new Date().toISOString(),
      version: "1.0",
    },
  };
}

/**
 * Build search index for education
 */
function buildEducationIndex(): SerializedIndex {
  const index = new MiniSearch<EducationItem>({
    fields: ["label", "description"],
    storeFields: ["id", "label", "description", "path"],
    idField: "id",
    searchOptions: {
      boost: { label: 2 },
      fuzzy: 0.2,
      prefix: true,
    },
  });

  // Combine education and certifications
  const allEducationItems = [
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

  return {
    index: index.toJSON(),
    metadata: {
      itemCount: dedupedEducationItems.length,
      buildTime: new Date().toISOString(),
      version: "1.0",
    },
  };
}

/**
 * Build search index for projects
 */
function buildProjectsIndexForBuilder(): SerializedIndex {
  const index = new MiniSearch<Project>({
    fields: ["name", "description", "tags"],
    storeFields: ["name", "description", "url"],
    idField: "name",
    searchOptions: { boost: { name: 2 }, fuzzy: 0.2, prefix: true },
  });

  // Deduplicate by name (assumed unique) - explicitly type for index builder
  const dedupedProjects: Project[] = prepareDocumentsForIndexing(
    projects as Array<Project & { id?: string | number }>,
    "Projects",
    p => p.name,
  );
  index.addAll(dedupedProjects);

  return {
    index: index.toJSON(),
    metadata: {
      itemCount: dedupedProjects.length,
      buildTime: new Date().toISOString(),
      version: "1.0",
    },
  };
}

/**
 * Build search index for bookmarks
 */
async function buildBookmarksIndex(): Promise<SerializedIndex> {
  // Fetch bookmarks from API
  const maybeBookmarks = await getBookmarks({ skipExternalFetch: false });
  if (!Array.isArray(maybeBookmarks)) {
    throw new Error("[Search Index Builder] Unexpected bookmarks payload");
  }
  const bookmarks = maybeBookmarks as UnifiedBookmark[];

  const index = new MiniSearch<BookmarkIndexItem>({
    fields: ["title", "description", "tags", "author", "publisher", "url"],
    storeFields: ["id", "title", "description", "url", "slug"],
    idField: "id",
    searchOptions: {
      boost: { title: 2, description: 1.5 },
      fuzzy: 0.2,
      prefix: true,
    },
  });

  // Load centralized slug mapping (preferred), but allow embedded slug fallback
  const slugMapping = await loadSlugMapping();

  // Transform bookmarks for indexing
  const bookmarksForIndex = bookmarks.map(b => {
    // Prefer embedded slug when present; fallback to centralized mapping
    const embedded = tryGetEmbeddedSlug(b);
    const slug = embedded ?? (slugMapping ? getSlugForBookmark(slugMapping, b.id) : null);

    // Every bookmark MUST have a slug for idempotency
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
      // Use newline delimiter to preserve multi-word tags (e.g., "machine learning")
      tags: Array.isArray(b.tags)
        ? b.tags.map(t => (typeof t === "string" ? t : (t as { name?: string })?.name || "")).join("\n")
        : "",
      url: b.url,
      author: b.content?.author || "",
      publisher: b.content?.publisher || "",
      slug, // slug is required (either embedded or via mapping)
    };
  });

  index.addAll(bookmarksForIndex);

  return {
    index: index.toJSON(),
    metadata: {
      itemCount: bookmarksForIndex.length,
      buildTime: new Date().toISOString(),
      version: "1.0",
    },
  };
}

/**
 * Build search index for books (from AudioBookShelf)
 */
async function buildBooksIndex(): Promise<SerializedIndex> {
  const books = await fetchBookListItems();

  const index = new MiniSearch<BookListItem>({
    fields: ["title", "authors"],
    storeFields: ["id", "title", "authors", "coverUrl"],
    idField: "id",
    searchOptions: {
      boost: { title: 2 },
      fuzzy: 0.2,
      prefix: true,
    },
    extractField: (document, fieldName) => {
      // CRITICAL: MiniSearch uses extractField for ALL fields including the ID field.
      // We must return the actual ID, not an empty string, or all docs get duplicate ID "".
      if (fieldName === "id") {
        return document.id;
      }
      if (fieldName === "authors") {
        return Array.isArray(document.authors) ? document.authors.join(" ") : "";
      }
      if (fieldName === "title") {
        return typeof document.title === "string" ? document.title : "";
      }
      return "";
    },
  });

  const dedupedBooks = prepareDocumentsForIndexing(books, "Books");
  index.addAll(dedupedBooks);

  return {
    index: index.toJSON(),
    metadata: {
      itemCount: dedupedBooks.length,
      buildTime: new Date().toISOString(),
      version: "1.0",
    },
  };
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
  // MiniSearch.loadJSON expects a JSON string, but after reading from S3
  // the index is already parsed into an object. We need to re-stringify it.
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

  if (!isPlainRecord(raw)) {
    return { fields: [], storeFields: [] };
  }

  const fields = isPlainRecord(raw.fieldIds) ? Object.keys(raw.fieldIds) : [];

  let storeFields: string[] = [];
  if (isPlainRecord(raw.storedFields)) {
    const storedValues = Object.values(raw.storedFields);
    for (const value of storedValues) {
      if (isPlainRecord(value)) {
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
    return isPlainRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
