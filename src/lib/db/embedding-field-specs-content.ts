/**
 * Embedding field specifications for content consumption domains.
 *
 * Covers: bookmarks, thoughts, books, blog posts — all text-heavy entities
 * that represent "things a reader reads."
 *
 * Labels are chosen to be unambiguous (see embedding-input-contracts.ts header).
 *
 * Verified against actual type definitions:
 *   bookmark  → src/types/schemas/bookmark.ts (UnifiedBookmark + BookmarkContent)
 *   thought   → src/types/schemas/thought.ts (thoughtSchema)
 *   book      → src/types/schemas/book.ts (bookSchema)
 *   blog      → src/types/blog.ts (BlogPost + BlogPageFrontmatter)
 *
 * @module lib/db/embedding-field-specs-content
 */

import type { EmbeddingFieldSpec } from "@/types/db/embeddings";

/** Source: `bookmarks` table. Entity ID: `bookmarks.id`. */
export const BOOKMARK_EMBEDDING_FIELDS: readonly EmbeddingFieldSpec[] = [
  {
    sourceKey: "title",
    label: "Page Title",
    meaning: "og:title of the bookmarked web page",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "description",
    label: "Page Description",
    meaning: "Meta description of the bookmarked web page",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "summary",
    label: "Content Summary",
    meaning: "AI-generated or human-written summary of page content",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "note",
    label: "Personal Annotation",
    meaning: "Freeform note added by the person who saved this bookmark",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "domain",
    label: "Website Hostname",
    meaning: "Internet hostname of the URL (e.g. 'github.com'), NOT a business sector",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "tags",
    label: "Topic Tags",
    meaning: "Classification keywords assigned by human or AI tagging system",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "content.title",
    label: "Crawled Page Title",
    meaning: "Title extracted by web crawler; included only when it differs from Page Title",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "content.description",
    label: "Crawled Page Description",
    meaning: "Description from web crawler; included only when it differs from Page Description",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "content.author",
    label: "Page Author",
    meaning: "Byline author of the bookmarked article",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "content.publisher",
    label: "Publisher Name",
    meaning: "Organization that published the bookmarked page",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "url",
    label: "Bookmarked URL",
    meaning: "Full URL of the bookmarked web page",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "scrapedContentText",
    label: "Scraped Page Text",
    meaning: "Full visible text body scraped from the page; truncation-safe (placed last)",
    required: false,
    verboseField: true,
  },
];

/** Source: `thoughts` table. Entity ID: `thoughts.id` (UUID). */
export const THOUGHT_EMBEDDING_FIELDS: readonly EmbeddingFieldSpec[] = [
  {
    sourceKey: "title",
    label: "Thought Title",
    meaning: "Headline of a short-form TIL entry",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "content",
    label: "Thought Full Text",
    meaning: "Complete body text of the thought (typically 1-3 paragraphs)",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "category",
    label: "Topic Category",
    meaning: "Single broad classification (e.g. 'programming'); NOT an internet domain",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "tags",
    label: "Topic Tags",
    meaning: "Keyword labels for classification and filtering",
    required: false,
    verboseField: false,
  },
];

/**
 * Source: `books_snapshots.payload` JSONB → `books` table.
 * Entity ID: AudioBookShelf item UUID.
 * Verified against `src/types/schemas/book.ts`.
 */
export const BOOK_EMBEDDING_FIELDS: readonly EmbeddingFieldSpec[] = [
  {
    sourceKey: "title",
    label: "Book Title",
    meaning: "Full title as it appears on the cover",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "subtitle",
    label: "Book Subtitle",
    meaning: "Secondary title line, if any",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "authors",
    label: "Authors",
    meaning: "People who wrote the book, comma-separated",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "genres",
    label: "Literary Genres",
    meaning: "Genre classifications (e.g. 'Science Fiction', 'Business')",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "publisher",
    label: "Publisher Name",
    meaning: "Publishing house that released the book",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "description",
    label: "Book Description",
    meaning: "Back-cover or catalog description (HTML-stripped from ABS API)",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "aiSummary",
    label: "AI-Generated Summary",
    meaning: "LLM-generated summary of content, themes, and takeaways",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "thoughts",
    label: "Personal Reading Notes",
    meaning: "Reader's personal annotations and reflections (subjective, first-person)",
    required: false,
    verboseField: true,
  },
];

/**
 * Source: MDX files in `data/blog/posts/*.mdx` → `blog_posts` table.
 * Entity ID: `"mdx-{slug}"`.
 * Verified against `src/types/blog.ts`.
 */
export const BLOG_POST_EMBEDDING_FIELDS: readonly EmbeddingFieldSpec[] = [
  {
    sourceKey: "title",
    label: "Article Title",
    meaning: "Headline of the blog post",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "excerpt",
    label: "Article Summary",
    meaning: "Purpose-written SEO/social preview description (not first paragraph)",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "tags",
    label: "Topic Tags",
    meaning: "Subject matter keywords (e.g. 'ai', 'typescript', 'devops')",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "author.name",
    label: "Article Author",
    meaning: "Display name of the person who wrote the article",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "rawContent",
    label: "Article Full Text",
    meaning: "Complete MDX body text with markup stripped; truncation-safe (placed last)",
    required: false,
    verboseField: true,
  },
];
