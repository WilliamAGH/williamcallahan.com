/**
 * Books Database Schema
 * @module lib/db/schema/books
 * @description
 * PostgreSQL tables for the consolidated books dataset.
 * Mirrors the S3 versioned-snapshot pattern: a single-row pointer table
 * (`books_latest`) references immutable JSONB snapshots (`books_snapshots`).
 */

import { bigint, index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import type { BooksDataset } from "@/types/schemas/book";

/**
 * Single-row pointer to the current books dataset snapshot.
 * The `id` column is always "current" (enforced by application code).
 */
export const booksLatest = pgTable("books_latest", {
  id: text("id").primaryKey().default("current"),
  snapshotChecksum: text("snapshot_checksum").notNull(),
  snapshotKey: text("snapshot_key").notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

/**
 * Versioned immutable snapshots of the entire books dataset.
 * Each row stores the full BooksDataset as JSONB in `payload`.
 */
export const booksSnapshots = pgTable(
  "books_snapshots",
  {
    checksum: text("checksum").primaryKey(),
    payload: jsonb("payload").$type<BooksDataset>().notNull(),
    bookCount: integer("book_count").notNull(),
    generatedAt: text("generated_at").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (table) => [index("idx_books_snapshots_created_at").on(table.createdAt)],
);
