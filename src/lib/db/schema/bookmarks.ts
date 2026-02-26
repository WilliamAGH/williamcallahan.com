import { type SQL, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  halfvec,
  index,
  integer,
  jsonb,
  pgTable,
  text,
} from "drizzle-orm/pg-core";
import type {
  BookmarkAsset,
  BookmarkContent,
  BookmarkTag,
  BookmarkLogoData,
} from "@/types/schemas/bookmark";
import type { RegistryLink } from "@/types/schemas/registry-link";

/**
 * Qwen3-Embedding-4B FP16 — the single authorized embedding model for this table.
 *
 * Model: Qwen/Qwen3-Embedding-4B (4 billion parameters, Apache-2.0)
 * Precision: FP16 (half-precision float) — stored via pgvector `halfvec`
 * Dimensions: 2560 (model default; do NOT truncate via MRL)
 * GGUF source: https://huggingface.co/Qwen/Qwen3-Embedding-4B-GGUF?show_file_info=Qwen3-Embedding-4B-f16.gguf
 *
 * INVARIANT: Every vector in `qwen_4b_fp16_embedding` MUST be produced by this
 * exact model at FP16 precision. Mixing quantizations or models creates
 * non-comparable vector spaces and silently degrades retrieval quality.
 */
export const BOOKMARK_EMBEDDING_MODEL = "Qwen/Qwen3-Embedding-4B" as const;
export const BOOKMARK_EMBEDDING_DIMENSIONS = 2560 as const;
export const BOOKMARK_EMBEDDING_GGUF_URL =
  "https://huggingface.co/Qwen/Qwen3-Embedding-4B-GGUF?show_file_info=Qwen3-Embedding-4B-f16.gguf" as const;

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const bookmarks = pgTable(
  "bookmarks",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    note: text("note"),
    summary: text("summary"),
    tags: jsonb("tags")
      .$type<Array<BookmarkTag | string>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    content: jsonb("content").$type<BookmarkContent | null>(),
    assets: jsonb("assets").$type<BookmarkAsset[] | null>(),
    logoData: jsonb("logo_data").$type<BookmarkLogoData | null>(),
    registryLinks: jsonb("registry_links").$type<RegistryLink[] | null>(),
    ogImage: text("og_image"),
    ogTitle: text("og_title"),
    ogDescription: text("og_description"),
    ogUrl: text("og_url"),
    ogImageExternal: text("og_image_external"),
    ogImageLastFetchedAt: text("og_image_last_fetched_at"),
    ogImageEtag: text("og_image_etag"),
    readingTime: integer("reading_time"),
    wordCount: integer("word_count"),
    archived: boolean("archived").notNull().default(false),
    isPrivate: boolean("is_private").notNull().default(false),
    isFavorite: boolean("is_favorite").notNull().default(false),
    taggingStatus: text("tagging_status"),
    domain: text("domain"),
    dateBookmarked: text("date_bookmarked").notNull(),
    datePublished: text("date_published"),
    dateCreated: text("date_created"),
    dateUpdated: text("date_updated"),
    modifiedAt: text("modified_at"),
    sourceUpdatedAt: text("source_updated_at").notNull(),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): SQL => sql`
        setweight(to_tsvector('english', coalesce(${bookmarks.title}, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(${bookmarks.description}, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(${bookmarks.summary}, '')), 'C') ||
        setweight(to_tsvector('english', coalesce(${bookmarks.note}, '')), 'D')
      `,
    ),
    /**
     * Qwen3-Embedding-4B FP16 vector (2560-d halfvec).
     * See module-level doc for model provenance and the non-mixing invariant.
     */
    qwen4bFp16Embedding: halfvec("qwen_4b_fp16_embedding", {
      dimensions: BOOKMARK_EMBEDDING_DIMENSIONS,
    }),
  },
  (table) => [
    index("idx_bookmarks_search_vector").using("gin", table.searchVector),
    index("idx_bookmarks_qwen_4b_fp16_embedding").using(
      "hnsw",
      table.qwen4bFp16Embedding.op("halfvec_cosine_ops"),
    ),
    index("idx_bookmarks_title_trgm").using("gin", sql`${table.title} gin_trgm_ops`),
    index("idx_bookmarks_slug_trgm").using("gin", sql`${table.slug} gin_trgm_ops`),
    index("idx_bookmarks_domain").on(table.domain),
    index("idx_bookmarks_date_bookmarked").on(table.dateBookmarked),
  ],
);
