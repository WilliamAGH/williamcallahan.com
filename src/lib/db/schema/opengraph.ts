import { bigint, index, jsonb, pgTable, text } from "drizzle-orm/pg-core";

/**
 * Cached OpenGraph metadata keyed by URL hash.
 *
 * Each row stores the full OgResult payload for a single URL. The `urlHash`
 * primary key matches the SHA-256 hex digest produced by `hashUrl()` in
 * `@/lib/utils/opengraph-utils`.
 */
export const opengraphMetadata = pgTable(
  "opengraph_metadata",
  {
    urlHash: text("url_hash").primaryKey(),
    url: text("url").notNull(),
    payload: jsonb("payload").notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [index("idx_opengraph_metadata_updated_at").on(table.updatedAt)],
);

/**
 * Manual OpenGraph overrides that take precedence over fetched metadata.
 *
 * Overrides are hand-curated entries that always win over external API results.
 * The table structure mirrors `opengraphMetadata` so queries are interchangeable.
 */
export const opengraphOverrides = pgTable(
  "opengraph_overrides",
  {
    urlHash: text("url_hash").primaryKey(),
    url: text("url").notNull(),
    payload: jsonb("payload").notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [index("idx_opengraph_overrides_updated_at").on(table.updatedAt)],
);
