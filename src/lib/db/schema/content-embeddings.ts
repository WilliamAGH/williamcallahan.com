/**
 * Unified content embeddings table — single HNSW index for all domains.
 *
 * All Qwen3-Embedding-4B FP16 vectors live here, keyed by (domain, entity_id).
 * Per-domain tables retain domain-specific columns and FTS/trigram indexes;
 * this table owns the embedding column and the single HNSW index.
 */

import { bigint, halfvec, index, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import type { ContentEmbeddingDomain } from "@/types/db/embeddings";
export { CONTENT_EMBEDDING_DOMAINS, type ContentEmbeddingDomain } from "@/types/db/embeddings";

/** Qwen3-Embedding-4B — the single authorized embedding model. */
export const CONTENT_EMBEDDING_MODEL = "Qwen/Qwen3-Embedding-4B" as const;

/** FP16 halfvec dimension count (model default; do NOT truncate via MRL). */
export const CONTENT_EMBEDDING_DIMENSIONS = 2560 as const;

export const contentEmbeddings = pgTable(
  "content_embeddings",
  {
    domain: text("domain").$type<ContentEmbeddingDomain>().notNull(),
    entityId: text("entity_id").notNull(),
    title: text("title").notNull(),
    embeddingText: text("embedding_text"),
    contentDate: text("content_date"),
    qwen4bFp16Embedding: halfvec("qwen_4b_fp16_embedding", {
      dimensions: CONTENT_EMBEDDING_DIMENSIONS,
    }),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.domain, table.entityId] }),
    index("idx_content_embeddings_hnsw").using(
      "hnsw",
      table.qwen4bFp16Embedding.op("halfvec_cosine_ops"),
    ),
    index("idx_content_embeddings_domain").on(table.domain),
  ],
);
