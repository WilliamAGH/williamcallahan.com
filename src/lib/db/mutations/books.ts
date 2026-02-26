/**
 * Books Database Mutations
 * @module lib/db/mutations/books
 * @description
 * Write operations for the books dataset in PostgreSQL.
 * Upserts an immutable snapshot row and atomically updates the latest pointer.
 */

import { assertDatabaseWriteAllowed, db } from "@/lib/db/connection";
import { booksLatest, booksSnapshots } from "@/lib/db/schema/books";
import type { BooksDataset } from "@/types/schemas/book";

const BOOKS_LATEST_ROW_ID = "current";

/**
 * Persist a books dataset snapshot and update the latest pointer atomically.
 *
 * 1. Upserts the snapshot row (keyed by checksum, so re-writes are idempotent).
 * 2. Upserts the single-row latest pointer to reference the new snapshot.
 *
 * Both operations run in a single transaction for consistency.
 */
export async function writeBooksSnapshot(dataset: BooksDataset, checksum: string): Promise<void> {
  assertDatabaseWriteAllowed("writeBooksSnapshot");

  const now = Date.now();
  const snapshotKey = `books_snapshots/${checksum}`;

  await db.transaction(async (tx) => {
    // Upsert the immutable snapshot (idempotent on checksum conflict)
    await tx
      .insert(booksSnapshots)
      .values({
        checksum,
        payload: dataset,
        bookCount: dataset.books.length,
        generatedAt: dataset.generated,
        createdAt: now,
      })
      .onConflictDoNothing({ target: booksSnapshots.checksum });

    // Upsert the latest pointer to reference this snapshot
    await tx
      .insert(booksLatest)
      .values({
        id: BOOKS_LATEST_ROW_ID,
        snapshotChecksum: checksum,
        snapshotKey,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: booksLatest.id,
        set: {
          snapshotChecksum: checksum,
          snapshotKey,
          updatedAt: now,
        },
      });
  });
}
