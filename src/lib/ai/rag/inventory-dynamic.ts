/**
 * RAG Inventory Dynamic Sections
 *
 * Builds inventory sections that rely on dynamic data sources
 * (bookmarks, books, tags, AI analysis, thoughts).
 *
 * @module lib/ai/rag/inventory-dynamic
 */

import "server-only";

import { PAGE_METADATA } from "@/data/metadata";
import { projects } from "@/data/projects";
import { getBookmarksIndex, getCachedBooksData } from "@/lib/search/loaders/dynamic-content";
import { aggregateTags } from "@/lib/search/tag-aggregator";
import { generateBookSlug } from "@/lib/books/slug-helpers";
import { listAnalysisItemIds } from "@/lib/ai-analysis/reader.server";
import { envLogger } from "@/lib/utils/env-logger";
import type { Book } from "@/types/schemas/book";
import type { BookmarkIndexItem } from "@/types/schemas/search";
import type { AggregatedTag } from "@/types/search";
import type { BlogPost } from "@/types/blog";
import type { InventorySectionName, InventoryStatus } from "@/types/rag";
import { buildSectionLines, formatLine, type SectionBuildResult } from "./inventory-format";

type DynamicInventoryInput = {
  blogPosts: BlogPost[];
};

type DynamicInventoryResult = {
  sections: SectionBuildResult[];
  failedSections: InventorySectionName[];
};

const buildBookmarksRows = (bookmarks: Array<BookmarkIndexItem & { slug: string }>): string[] =>
  bookmarks
    .toSorted((a, b) => (a.title ?? "").localeCompare(b.title ?? ""))
    .map((bookmark) =>
      formatLine({
        id: bookmark.id,
        slug: bookmark.slug,
        title: bookmark.title,
        url: `/bookmarks/${bookmark.slug}`,
        tags: bookmark.tags.split("\n").filter(Boolean),
      }),
    );

const buildBooksRows = (books: Book[]): string[] =>
  books
    .toSorted((a, b) => a.title.localeCompare(b.title))
    .map((book) =>
      formatLine({
        id: book.id,
        title: book.title,
        authors: book.authors,
        publishedYear: book.publishedYear,
        url: `/books/${generateBookSlug(book.title, book.id, book.authors)}`,
      }),
    );

const buildTagsRows = (tags: AggregatedTag[]): string[] =>
  tags
    .toSorted((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .map((tag) =>
      formatLine({
        name: tag.name,
        slug: tag.slug,
        contentType: tag.contentType,
        count: tag.count,
        url: tag.url,
      }),
    );

const buildAnalysisRows = (args: {
  domain: "bookmarks" | "books" | "projects";
  ids: string[];
  bookmarksById: Map<string, { title: string; url: string }>;
  booksById: Map<string, { title: string; url: string }>;
  projectsById: Map<string, { title: string; url: string }>;
}): string[] => {
  const { domain, ids, bookmarksById, booksById, projectsById } = args;

  return ids.map((id) => {
    const lookup =
      domain === "bookmarks"
        ? bookmarksById.get(id)
        : domain === "books"
          ? booksById.get(id)
          : projectsById.get(id);

    return formatLine({
      domain,
      id,
      title: lookup?.title,
      url: lookup?.url,
    });
  });
};

export async function buildDynamicInventorySections(
  input: DynamicInventoryInput,
): Promise<DynamicInventoryResult> {
  const sections: SectionBuildResult[] = [];
  const failedSections: InventorySectionName[] = [];
  const { blogPosts } = input;

  let bookmarks: Array<BookmarkIndexItem & { slug: string }> = [];
  let books: Book[] = [];

  try {
    const bookmarkIndex = await getBookmarksIndex();
    bookmarks = bookmarkIndex.bookmarks;
    sections.push(
      buildSectionLines({
        name: "bookmarks",
        fields: ["id", "slug", "title", "url", "tags"],
        rows: buildBookmarksRows(bookmarks),
        status: "success",
      }),
    );
  } catch (error) {
    envLogger.log("[RAG Inventory] Failed to load bookmarks", { error }, { category: "RAG" });
    failedSections.push("bookmarks");
    sections.push(
      buildSectionLines({
        name: "bookmarks",
        fields: ["id", "slug", "title", "url", "tags"],
        rows: [],
        status: "failed",
        note: "Failed to load bookmarks",
      }),
    );
  }

  try {
    books = await getCachedBooksData();
    sections.push(
      buildSectionLines({
        name: "books",
        fields: ["id", "title", "authors", "publishedYear", "url"],
        rows: buildBooksRows(books),
        status: "success",
      }),
    );
  } catch (error) {
    envLogger.log("[RAG Inventory] Failed to load books", { error }, { category: "RAG" });
    failedSections.push("books");
    sections.push(
      buildSectionLines({
        name: "books",
        fields: ["id", "title", "authors", "publishedYear", "url"],
        rows: [],
        status: "failed",
        note: "Failed to load books",
      }),
    );
  }

  const tagSources: Array<Promise<AggregatedTag[]>> = [];
  const tagFailures: string[] = [];

  if (blogPosts.length > 0) {
    tagSources.push(
      aggregateTags({
        items: blogPosts,
        getTags: (post) => post.tags,
        contentType: "blog",
        urlPattern: (slug) => `/blog/tags/${slug}`,
      }),
    );
  }

  tagSources.push(
    aggregateTags({
      items: projects,
      getTags: (project) => project.tags,
      contentType: "projects",
      urlPattern: (slug) => `/projects?tag=${slug}`,
    }),
  );

  if (bookmarks.length > 0) {
    tagSources.push(
      aggregateTags({
        items: bookmarks,
        getTags: (bookmark) => bookmark.tags.split("\n").filter(Boolean),
        contentType: "bookmarks",
        urlPattern: (slug) => `/bookmarks/tags/${slug}`,
      }),
    );
  }

  if (books.length > 0) {
    tagSources.push(
      aggregateTags({
        items: books,
        getTags: (book) => book.genres,
        contentType: "books",
        urlPattern: (slug) => `/books?genre=${slug}`,
      }),
    );
  }

  let tagResults: AggregatedTag[] = [];
  if (tagSources.length > 0) {
    const tagSettled = await Promise.allSettled(tagSources);
    for (const result of tagSettled) {
      if (result.status === "fulfilled") {
        tagResults = tagResults.concat(result.value);
      } else {
        tagFailures.push(String(result.reason));
      }
    }
  }

  const tagsStatus: InventoryStatus = tagFailures.length > 0 ? "partial" : "success";
  if (tagFailures.length > 0) failedSections.push("tags");
  sections.push(
    buildSectionLines({
      name: "tags",
      fields: ["name", "slug", "contentType", "count", "url"],
      rows: buildTagsRows(tagResults),
      status: tagsStatus,
      note: tagFailures.length > 0 ? "Some tag sources failed" : undefined,
    }),
  );

  const bookmarksById = new Map<string, { title: string; url: string }>();
  for (const bookmark of bookmarks) {
    bookmarksById.set(bookmark.id, {
      title: bookmark.title ?? bookmark.slug,
      url: `/bookmarks/${bookmark.slug}`,
    });
    bookmarksById.set(bookmark.slug, {
      title: bookmark.title ?? bookmark.slug,
      url: `/bookmarks/${bookmark.slug}`,
    });
  }

  const booksById = new Map<string, { title: string; url: string }>();
  for (const book of books) {
    booksById.set(book.id, {
      title: book.title,
      url: `/books/${generateBookSlug(book.title, book.id, book.authors)}`,
    });
  }

  const projectsById = new Map<string, { title: string; url: string }>();
  for (const project of projects) {
    projectsById.set(project.id, {
      title: project.name,
      url: project.url ?? `/projects#${project.id}`,
    });
  }

  try {
    const [bookmarkIds, bookIds, projectIds] = await Promise.all([
      listAnalysisItemIds("bookmarks"),
      listAnalysisItemIds("books"),
      listAnalysisItemIds("projects"),
    ]);

    sections.push(
      buildSectionLines({
        name: "analysis",
        fields: ["domain", "id", "title", "url"],
        rows: [
          ...buildAnalysisRows({
            domain: "bookmarks",
            ids: bookmarkIds,
            bookmarksById,
            booksById,
            projectsById,
          }),
          ...buildAnalysisRows({
            domain: "books",
            ids: bookIds,
            bookmarksById,
            booksById,
            projectsById,
          }),
          ...buildAnalysisRows({
            domain: "projects",
            ids: projectIds,
            bookmarksById,
            booksById,
            projectsById,
          }),
        ],
        status: "success",
      }),
    );
  } catch (error) {
    envLogger.log("[RAG Inventory] Failed to list AI analysis", { error }, { category: "RAG" });
    failedSections.push("analysis");
    sections.push(
      buildSectionLines({
        name: "analysis",
        fields: ["domain", "id", "title", "url"],
        rows: [],
        status: "failed",
        note: "Failed to list AI analysis",
      }),
    );
  }

  const thoughtsTitle =
    typeof PAGE_METADATA.thoughts.title === "string" ? PAGE_METADATA.thoughts.title : "Thoughts";
  sections.push(
    buildSectionLines({
      name: "thoughts",
      fields: ["id", "title", "url"],
      rows: [formatLine({ id: "thoughts", title: thoughtsTitle, url: "/thoughts" })],
      status: "success",
    }),
  );

  return { sections, failedSections };
}
