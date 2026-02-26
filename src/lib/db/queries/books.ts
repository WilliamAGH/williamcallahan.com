/**
 * Books Database Queries
 * @module lib/db/queries/books
 * @description
 * Read-only queries for the books dataset stored in PostgreSQL.
 * Follows the two-step lookup: latest pointer -> versioned snapshot.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/connection";
import { booksLatest, booksSnapshots } from "@/lib/db/schema/books";
import { booksDatasetSchema } from "@/types/schemas/book";
import type { Book, BooksDataset } from "@/types/schemas/book";

/**
 * Read the current latest pointer (checksum + key).
 * Returns null when no snapshot has been written yet.
 */
export async function readBooksLatestPointer(): Promise<{
  checksum: string;
  key: string;
} | null> {
  const rows = await db
    .select({
      checksum: booksLatest.snapshotChecksum,
      key: booksLatest.snapshotKey,
    })
    .from(booksLatest)
    .where(eq(booksLatest.id, "current"))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }
  return { checksum: row.checksum, key: row.key };
}

/**
 * Read a versioned books snapshot by checksum.
 * Validates the JSONB payload through `booksDatasetSchema` at the IO boundary.
 * Returns null when the checksum does not exist.
 */
export async function readBooksSnapshot(checksum: string): Promise<BooksDataset | null> {
  const rows = await db
    .select({ payload: booksSnapshots.payload })
    .from(booksSnapshots)
    .where(eq(booksSnapshots.checksum, checksum))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return booksDatasetSchema.parse(row.payload);
}

/**
 * High-level convenience: read latest pointer then fetch the snapshot.
 * Returns the Book[] array, or an empty array if no dataset exists.
 */
export async function readBooksFromDb(): Promise<Book[]> {
  const pointer = await readBooksLatestPointer();
  if (!pointer) {
    return [];
  }

  const dataset = await readBooksSnapshot(pointer.checksum);
  if (!dataset) {
    return [];
  }

  return dataset.books;
}
