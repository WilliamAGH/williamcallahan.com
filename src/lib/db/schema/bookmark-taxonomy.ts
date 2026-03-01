import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { bookmarks } from "@/lib/db/schema/bookmarks";
import type { SearchIndexArtifactDomain } from "@/types/schemas/search";

const buildBookmarkIndexStateColumns = () => ({
  count: integer("count").notNull(),
  totalPages: integer("total_pages").notNull(),
  pageSize: integer("page_size").notNull(),
  lastModified: text("last_modified").notNull(),
  lastFetchedAt: bigint("last_fetched_at", { mode: "number" }).notNull(),
  lastAttemptedAt: bigint("last_attempted_at", { mode: "number" }).notNull(),
  checksum: text("checksum").notNull(),
  changeDetected: boolean("change_detected").notNull().default(true),
});

export const bookmarkTagLinks = pgTable(
  "bookmark_tag_links",
  {
    bookmarkId: text("bookmark_id")
      .notNull()
      .references(() => bookmarks.id, { onDelete: "cascade" }),
    tagSlug: text("tag_slug").notNull(),
    tagName: text("tag_name").notNull(),
    dateBookmarked: text("date_bookmarked").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.bookmarkId, table.tagSlug],
      name: "bookmark_tag_links_pk",
    }),
    index("idx_bookmark_tag_links_slug_date").on(
      table.tagSlug,
      table.dateBookmarked,
      table.bookmarkId,
    ),
    index("idx_bookmark_tag_links_bookmark").on(table.bookmarkId),
  ],
);

export const bookmarkTags = pgTable(
  "bookmarks_tags",
  {
    tagSlug: text("tag_slug").primaryKey(),
    tagName: text("tag_name").notNull(),
    tagStatus: text("tag_status").notNull().default("primary"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [index("idx_bookmarks_tags_status").on(table.tagStatus)],
);

export const bookmarkTagAliasLinks = pgTable(
  "bookmarks_tags_links",
  {
    sourceTagSlug: text("source_tag_slug")
      .notNull()
      .references(() => bookmarkTags.tagSlug, { onDelete: "cascade", onUpdate: "cascade" }),
    targetTagSlug: text("target_tag_slug")
      .notNull()
      .references(() => bookmarkTags.tagSlug, { onDelete: "cascade", onUpdate: "cascade" }),
    linkType: text("link_type").notNull().default("alias"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.sourceTagSlug, table.targetTagSlug],
      name: "bookmarks_tags_links_pk",
    }),
    uniqueIndex("idx_bookmarks_tags_links_source_alias").on(table.sourceTagSlug),
    index("idx_bookmarks_tags_links_target").on(table.targetTagSlug),
  ],
);

export const bookmarkIndexState = pgTable("bookmark_index_state", {
  id: text("id").primaryKey(),
  ...buildBookmarkIndexStateColumns(),
});

export const bookmarkTagIndexState = pgTable(
  "bookmark_tag_index_state",
  {
    tagSlug: text("tag_slug").primaryKey(),
    tagName: text("tag_name").notNull(),
    ...buildBookmarkIndexStateColumns(),
  },
  (table) => [index("idx_bookmark_tag_index_state_tag_name").on(table.tagName)],
);

export const searchIndexArtifacts = pgTable(
  "search_index_artifacts",
  {
    domain: text("domain").primaryKey().$type<SearchIndexArtifactDomain>(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    checksum: text("checksum").notNull(),
    itemCount: integer("item_count").notNull(),
    generatedAt: text("generated_at").notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [index("idx_search_index_artifacts_updated_at").on(table.updatedAt)],
);
