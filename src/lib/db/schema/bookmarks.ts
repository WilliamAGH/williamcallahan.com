import { type SQL, sql } from "drizzle-orm";
import { boolean, customType, index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import type {
  BookmarkAsset,
  BookmarkContent,
  BookmarkTag,
  BookmarkLogo,
} from "@/types/schemas/bookmark";

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
    logoData: jsonb("logo_data").$type<BookmarkLogo | null>(),
    ogImage: text("og_image"),
    ogTitle: text("og_title"),
    ogDescription: text("og_description"),
    ogUrl: text("og_url"),
    ogImageExternal: text("og_image_external"),
    ogImageLastFetchedAt: text("og_image_last_fetched_at"),
    ogImageEtag: text("og_image_etag"),
    readingTime: integer("reading_time"),
    wordCount: integer("word_count"),
    scrapedContentText: text("scraped_content_text"),
    archived: boolean("archived").notNull().default(false),
    isPrivate: boolean("is_private").notNull().default(false),
    isFavorite: boolean("is_favorite").notNull().default(false),
    taggingStatus: text("tagging_status"),
    domain: text("domain"),
    dateBookmarked: text("date_bookmarked").notNull(),
    datePublished: text("date_published"),
    dateCreated: text("date_created"),
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
  },
  (table) => [
    index("idx_bookmarks_search_vector").using("gin", table.searchVector),
    index("idx_bookmarks_title_trgm").using("gin", sql`${table.title} gin_trgm_ops`),
    index("idx_bookmarks_slug_trgm").using("gin", sql`${table.slug} gin_trgm_ops`),
    index("idx_bookmarks_domain").on(table.domain),
    index("idx_bookmarks_date_bookmarked").on(table.dateBookmarked),
  ],
);
