/**
 * Book individual row mutations — upsert books from snapshot data.
 *
 * Normalizes the JSONB blob stored in books_snapshots into per-book rows.
 * Schema: src/lib/db/schema/books-individual.ts
 *
 * @module lib/db/mutations/books-individual
 */

import { assertDatabaseWriteAllowed, db } from "@/lib/db/connection";
import { booksIndividual } from "@/lib/db/schema/books-individual";
import type { Book } from "@/types/schemas/book";

function bookToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Upsert a batch of books into the normalized books table.
 * Uses ON CONFLICT on primary key (id = ABS item UUID).
 */
export async function upsertBooks(data: Book[]): Promise<number> {
  assertDatabaseWriteAllowed("upsertBooks");

  let upserted = 0;
  for (const book of data) {
    const slug = bookToSlug(book.title);
    await db
      .insert(booksIndividual)
      .values({
        id: book.id,
        title: book.title,
        slug,
        subtitle: book.subtitle ?? null,
        authors: book.authors ?? null,
        publisher: book.publisher ?? null,
        publishedYear: book.publishedYear ?? null,
        genres: book.genres ?? null,
        description: book.description ?? null,
        formats: book.formats,
        isbn10: book.isbn10 ?? null,
        isbn13: book.isbn13 ?? null,
        asin: book.asin ?? null,
        audioNarrators: book.audioNarrators ?? null,
        audioDurationSeconds: book.audioDurationSeconds ?? null,
        audioChapterCount: book.audioChapterCount ?? null,
        coverUrl: book.coverUrl ?? null,
        coverBlurDataURL: book.coverBlurDataURL ?? null,
        findMyBookUrl: book.findMyBookUrl ?? null,
        publisherUrl: book.publisherUrl ?? null,
        amazonUrl: book.amazonUrl ?? null,
        audibleUrl: book.audibleUrl ?? null,
        bookshopUrl: book.bookshopUrl ?? null,
        aiSummary: book.aiSummary ?? null,
        thoughts: book.thoughts ?? null,
      })
      .onConflictDoUpdate({
        target: booksIndividual.id,
        set: {
          title: book.title,
          slug,
          subtitle: book.subtitle ?? null,
          authors: book.authors ?? null,
          publisher: book.publisher ?? null,
          publishedYear: book.publishedYear ?? null,
          genres: book.genres ?? null,
          description: book.description ?? null,
          formats: book.formats,
          isbn10: book.isbn10 ?? null,
          isbn13: book.isbn13 ?? null,
          asin: book.asin ?? null,
          audioNarrators: book.audioNarrators ?? null,
          audioDurationSeconds: book.audioDurationSeconds ?? null,
          audioChapterCount: book.audioChapterCount ?? null,
          coverUrl: book.coverUrl ?? null,
          coverBlurDataURL: book.coverBlurDataURL ?? null,
          findMyBookUrl: book.findMyBookUrl ?? null,
          publisherUrl: book.publisherUrl ?? null,
          amazonUrl: book.amazonUrl ?? null,
          audibleUrl: book.audibleUrl ?? null,
          bookshopUrl: book.bookshopUrl ?? null,
          aiSummary: book.aiSummary ?? null,
          thoughts: book.thoughts ?? null,
        },
      });
    upserted += 1;
  }
  return upserted;
}
