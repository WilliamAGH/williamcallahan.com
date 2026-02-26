/**
 * Project queries — read project data from PostgreSQL.
 *
 * @module lib/db/queries/projects
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/connection";
import { projects } from "@/lib/db/schema/projects";

/** Retrieve all projects ordered by name. */
export async function getProjects() {
  return db.select().from(projects).orderBy(projects.name);
}

/** Retrieve a single project by slug. Returns undefined if not found. */
export async function getProjectBySlug(slug: string) {
  const rows = await db.select().from(projects).where(eq(projects.slug, slug)).limit(1);
  return rows[0];
}

/** Retrieve a single project by id. Returns undefined if not found. */
export async function getProjectById(id: string) {
  const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return rows[0];
}

/** Retrieve only CV-featured projects ordered by name. */
export async function getCvFeaturedProjects() {
  return db.select().from(projects).where(eq(projects.cvFeatured, true)).orderBy(projects.name);
}
