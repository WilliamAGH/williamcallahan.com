/**
 * AI Analysis PostgreSQL Schema
 * @module lib/db/schema/ai-analysis
 * @description
 * Drizzle ORM table definitions for persisting AI-generated analysis.
 * Replaces S3 JSON storage with PostgreSQL for both latest and versioned data.
 *
 * Tables:
 * - `ai_analysis_latest`: One row per (domain, entityId) for fast lookups
 * - `ai_analysis_versions`: Append-only history keyed by (domain, entityId, generatedAt)
 */

import { bigint, index, jsonb, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

/**
 * Latest analysis for each (domain, entityId) pair.
 * Primary read path; upserted on every persist.
 */
export const aiAnalysisLatest = pgTable(
  "ai_analysis_latest",
  {
    /** Analysis domain: "bookmarks" | "books" | "projects" */
    domain: text("domain").notNull(),
    /** Domain-specific entity identifier (e.g., bookmark ID, book slug) */
    entityId: text("entity_id").notNull(),
    /** Full CachedAnalysis<T> JSON envelope (metadata + analysis) */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** ISO timestamp when the analysis was generated */
    generatedAt: text("generated_at").notNull(),
    /** Model version identifier (e.g., "v1", "gpt-4-turbo") */
    modelVersion: text("model_version").notNull(),
    /** Optional content hash for change detection */
    contentHash: text("content_hash"),
    /** Unix epoch milliseconds of last upsert */
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.domain, table.entityId], name: "ai_analysis_latest_pk" }),
    index("idx_ai_analysis_latest_domain").on(table.domain),
    index("idx_ai_analysis_latest_updated_at").on(table.updatedAt),
  ],
);

/**
 * Versioned analysis history.
 * Append-only; one row per (domain, entityId, generatedAt) triple.
 */
export const aiAnalysisVersions = pgTable(
  "ai_analysis_versions",
  {
    /** Analysis domain: "bookmarks" | "books" | "projects" */
    domain: text("domain").notNull(),
    /** Domain-specific entity identifier */
    entityId: text("entity_id").notNull(),
    /** ISO timestamp when the analysis was generated (unique per version) */
    generatedAt: text("generated_at").notNull(),
    /** Full CachedAnalysis<T> JSON envelope */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** Model version identifier */
    modelVersion: text("model_version").notNull(),
    /** Optional content hash for change detection */
    contentHash: text("content_hash"),
    /** Unix epoch milliseconds when this version row was inserted */
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.domain, table.entityId, table.generatedAt],
      name: "ai_analysis_versions_pk",
    }),
    index("idx_ai_analysis_versions_domain_entity").on(table.domain, table.entityId),
  ],
);
