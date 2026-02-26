/**
 * Book individual row queries — read normalized book data from PostgreSQL.
 *
 * @module lib/db/queries/books-individual
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/connection";
import { booksIndividual } from "@/lib/db/schema/books-individual";

/** Retrieve all books ordered by title. */
export async function getAllBooks() {
  return db.select().from(booksIndividual).orderBy(booksIndividual.title);
}

/** Retrieve a single book by slug. Returns undefined if not found. */
export async function getBookBySlug(slug: string) {
  const rows = await db
    .select()
    .from(booksIndividual)
    .where(eq(booksIndividual.slug, slug))
    .limit(1);
  return rows[0];
}

/** Retrieve a single book by id (ABS UUID). Returns undefined if not found. */
export async function getBookById(id: string) {
  const rows = await db.select().from(booksIndividual).where(eq(booksIndividual.id, id)).limit(1);
  return rows[0];
}
