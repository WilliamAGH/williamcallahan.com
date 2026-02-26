/**
 * Investment queries — read investment data from PostgreSQL.
 *
 * @module lib/db/queries/investments
 */

import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/connection";
import { investments } from "@/lib/db/schema/investments";

/** Retrieve all investments ordered by invested year (newest first). */
export async function getInvestments() {
  return db.select().from(investments).orderBy(desc(investments.investedYear));
}

/** Retrieve a single investment by slug. Returns undefined if not found. */
export async function getInvestmentBySlug(slug: string) {
  const rows = await db.select().from(investments).where(eq(investments.slug, slug)).limit(1);
  return rows[0];
}

/** Retrieve a single investment by id. Returns undefined if not found. */
export async function getInvestmentById(id: string) {
  const rows = await db.select().from(investments).where(eq(investments.id, id)).limit(1);
  return rows[0];
}
