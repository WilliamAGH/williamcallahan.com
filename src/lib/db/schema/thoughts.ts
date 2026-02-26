import { type SQL, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  halfvec,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const THOUGHT_EMBEDDING_DIMENSIONS = 2560 as const;

/**
 * Thoughts table — TIL-style short-form content stored in PostgreSQL.
 *
 * Timestamps use epoch millis (bigint) consistent with other tables
 * (github_activity_store, content_graph_artifacts). The Zod schema expects
 * ISO datetime strings, so the query layer converts between the two.
 */
export const thoughts = pgTable(
  "thoughts",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }),
    category: text("category"),
    tags: text("tags").array(),
    draft: boolean("draft").default(false),
    relatedThoughts: uuid("related_thoughts").array(),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): SQL => sql`
        setweight(to_tsvector('english', coalesce(${thoughts.title}, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(${thoughts.content}, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(${thoughts.category}, '')), 'C')
      `,
    ),
    /**
     * Qwen3-Embedding-4B FP16 vector (2560-d halfvec).
     * Embeds title + content + category + tags for semantic search.
     */
    qwen4bFp16Embedding: halfvec("qwen_4b_fp16_embedding", {
      dimensions: THOUGHT_EMBEDDING_DIMENSIONS,
    }),
  },
  (table) => [
    uniqueIndex("idx_thoughts_slug").on(table.slug),
    index("idx_thoughts_category").on(table.category),
    index("idx_thoughts_created_at").on(table.createdAt),
    index("idx_thoughts_search_vector").using("gin", table.searchVector),
    index("idx_thoughts_embedding").using(
      "hnsw",
      table.qwen4bFp16Embedding.op("halfvec_cosine_ops"),
    ),
    index("idx_thoughts_title_trgm").using("gin", sql`${table.title} gin_trgm_ops`),
  ],
);
