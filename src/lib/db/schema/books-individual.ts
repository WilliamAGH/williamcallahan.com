/**
 * Books Individual Rows PostgreSQL Schema
 *
 * Normalized per-book rows with FTS + trigram indexes.
 * Source data: books_snapshots.payload (JSONB blob, normalized at seed time).
 * Embeddings live in embeddings (domain = 'book').
 *
 * Complements (does not replace) books.ts which stores the snapshot blob.
 * Type definition: src/types/schemas/book.ts (bookSchema)
 *
 * @module lib/db/schema/books-individual
 */

import { type SQL, sql } from "drizzle-orm";
import {
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const booksIndividual = pgTable(
  "books",
  {
    /** AudioBookShelf item UUID */
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    subtitle: text("subtitle"),
    authors: jsonb("authors").$type<string[]>(),
    publisher: text("publisher"),
    publishedYear: text("published_year"),
    genres: jsonb("genres").$type<string[]>(),
    description: text("description"),
    formats: jsonb("formats").$type<string[]>().notNull(),
    isbn10: text("isbn10"),
    isbn13: text("isbn13"),
    asin: text("asin"),
    audioNarrators: jsonb("audio_narrators").$type<string[]>(),
    audioDurationSeconds: doublePrecision("audio_duration_seconds"),
    audioChapterCount: integer("audio_chapter_count"),
    coverUrl: text("cover_url"),
    coverBlurDataURL: text("cover_blur_data_url"),
    findMyBookUrl: text("find_my_book_url"),
    publisherUrl: text("publisher_url"),
    amazonUrl: text("amazon_url"),
    audibleUrl: text("audible_url"),
    bookshopUrl: text("bookshop_url"),
    aiSummary: text("ai_summary"),
    thoughts: text("thoughts"),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): SQL => sql`
        setweight(to_tsvector('english', coalesce(${booksIndividual.title}, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(${booksIndividual.subtitle}, '') || ' ' || coalesce(${booksIndividual.description}, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(${booksIndividual.aiSummary}, '')), 'C')
      `,
    ),
  },
  (table) => [
    uniqueIndex("idx_books_slug").on(table.slug),
    index("idx_books_search_vector").using("gin", table.searchVector),
    index("idx_books_title_trgm").using("gin", sql`${table.title} gin_trgm_ops`),
  ],
);
