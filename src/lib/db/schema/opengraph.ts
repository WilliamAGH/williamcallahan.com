import { bigint, halfvec, index, jsonb, pgTable, text } from "drizzle-orm/pg-core";

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
    /**
     * Qwen3-Embedding-4B FP16 vector (2560-d halfvec).
     * Embeds og:title + og:description for semantic URL discovery.
     */
    qwen4bFp16Embedding: halfvec("qwen_4b_fp16_embedding", { dimensions: 2560 }),
  },
  (table) => [
    index("idx_opengraph_metadata_updated_at").on(table.updatedAt),
    index("idx_opengraph_metadata_embedding").using(
      "hnsw",
      table.qwen4bFp16Embedding.op("halfvec_cosine_ops"),
    ),
  ],
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
