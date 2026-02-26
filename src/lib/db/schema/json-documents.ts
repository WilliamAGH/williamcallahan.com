import { bigint, index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";

/**
 * Canonical JSON document storage for former S3 JSON keys.
 * Key remains the stable identifier so existing call sites stay unchanged.
 */
export const jsonDocuments = pgTable(
  "json_documents",
  {
    key: text("key").primaryKey(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    contentType: text("content_type").notNull(),
    eTag: text("etag"),
    contentLength: integer("content_length").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("idx_json_documents_updated_at").on(table.updatedAt),
    index("idx_json_documents_key").on(table.key),
  ],
);
