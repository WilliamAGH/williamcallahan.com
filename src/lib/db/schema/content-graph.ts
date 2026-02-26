/**
 * Content Graph Artifacts Schema
 * @module lib/db/schema/content-graph
 * @description
 * PostgreSQL table for storing pre-computed content graph data.
 * Uses a keyed JSONB store pattern (same as search_index_artifacts):
 * each artifact type is a single row with its full payload as JSONB.
 *
 * Artifact types:
 * - "related-content": contentKey -> related items mapping
 * - "tag-graph": tag co-occurrence graph
 * - "metadata": build metadata (version, counts, timestamp)
 * - "books-related": books-specific related content
 */

import { bigint, index, jsonb, pgTable, text } from "drizzle-orm/pg-core";

export const CONTENT_GRAPH_ARTIFACT_TYPES = [
  "related-content",
  "tag-graph",
  "metadata",
  "books-related",
] as const;

export const contentGraphArtifacts = pgTable(
  "content_graph_artifacts",
  {
    artifactType: text("artifact_type")
      .primaryKey()
      .$type<(typeof CONTENT_GRAPH_ARTIFACT_TYPES)[number]>(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    generatedAt: text("generated_at").notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [index("idx_content_graph_artifacts_updated_at").on(table.updatedAt)],
);
