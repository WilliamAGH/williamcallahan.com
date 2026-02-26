import { bigint, boolean, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Thoughts table — TIL-style short-form content stored in PostgreSQL.
 *
 * Timestamps use epoch millis (bigint) consistent with other tables
 * (github_activity_store, json_documents). The Zod schema expects
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
  },
  (table) => [
    uniqueIndex("idx_thoughts_slug").on(table.slug),
    index("idx_thoughts_category").on(table.category),
    index("idx_thoughts_created_at").on(table.createdAt),
  ],
);
