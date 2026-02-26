/**
 * Projects PostgreSQL Schema
 *
 * Static project portfolio data with FTS + trigram indexes.
 * Embeddings live in embeddings (domain = 'project').
 *
 * Source data: data/projects.ts (seeded via scripts/seed-projects.node.mjs)
 * Type definition: src/types/project.ts (Project interface)
 *
 * @module lib/db/schema/projects
 */

import { type SQL, sql } from "drizzle-orm";
import { boolean, customType, index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import type { RegistryLink } from "@/types/schemas/registry-link";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull(),
    shortSummary: text("short_summary").notNull(),
    url: text("url").notNull(),
    githubUrl: text("github_url"),
    imageKey: text("image_key").notNull(),
    tags: jsonb("tags").$type<string[]>(),
    techStack: jsonb("tech_stack").$type<string[]>(),
    note: text("note"),
    cvFeatured: boolean("cv_featured").notNull().default(false),
    registryLinks: jsonb("registry_links").$type<RegistryLink[]>(),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): SQL => sql`
        setweight(to_tsvector('english', coalesce(${projects.name}, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(${projects.description}, '') || ' ' || coalesce(${projects.shortSummary}, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(${projects.note}, '')), 'C')
      `,
    ),
  },
  (table) => [
    uniqueIndex("idx_projects_slug").on(table.slug),
    index("idx_projects_search_vector").using("gin", table.searchVector),
    index("idx_projects_name_trgm").using("gin", sql`${table.name} gin_trgm_ops`),
  ],
);
