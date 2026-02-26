/**
 * Project mutations — upsert project data into PostgreSQL.
 *
 * Source data: data/projects.ts (static portfolio data)
 * Schema: src/lib/db/schema/projects.ts
 *
 * @module lib/db/mutations/projects
 */

import { assertDatabaseWriteAllowed, db } from "@/lib/db/connection";
import { projects } from "@/lib/db/schema/projects";
import type { Project } from "@/types/project";

function projectToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Upsert a batch of projects.
 * Uses ON CONFLICT on primary key (id) for idempotent writes.
 */
export async function upsertProjects(data: Project[]): Promise<number> {
  assertDatabaseWriteAllowed("upsertProjects");

  let upserted = 0;
  for (const item of data) {
    const id = item.id ?? projectToSlug(item.name);
    const slug = projectToSlug(item.name);
    await db
      .insert(projects)
      .values({
        id,
        name: item.name,
        slug,
        description: item.description,
        shortSummary: item.shortSummary,
        url: item.url,
        githubUrl: item.githubUrl ?? null,
        imageKey: item.imageKey,
        tags: item.tags ?? null,
        techStack: item.techStack ?? null,
        note: item.note ?? null,
        cvFeatured: item.cvFeatured ?? false,
        registryLinks: item.registryLinks ?? null,
      })
      .onConflictDoUpdate({
        target: projects.id,
        set: {
          name: item.name,
          slug,
          description: item.description,
          shortSummary: item.shortSummary,
          url: item.url,
          githubUrl: item.githubUrl ?? null,
          imageKey: item.imageKey,
          tags: item.tags ?? null,
          techStack: item.techStack ?? null,
          note: item.note ?? null,
          cvFeatured: item.cvFeatured ?? false,
          registryLinks: item.registryLinks ?? null,
        },
      });
    upserted += 1;
  }
  return upserted;
}
