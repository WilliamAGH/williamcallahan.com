-- Index array-of-string bookmark tags in the search vector.
--
-- bookmarks.tags is typed Array<BookmarkTag | string> (src/lib/db/schema/bookmarks.ts),
-- and listTagCounts already reads both shapes, but 0025 extracted only
-- '$[*].name'. A string element yields nothing from that path, so a tag-only
-- query against a string-tagged row matched nothing on the keyword layer --
-- the exact gap 0025 set out to close.
--
-- Verified on the live database: with tags '[{"name":"Speculative Decoding"}, "String Only Tag"]',
-- the 0025 expression does not match 'string only tag' while the expression
-- below matches both it and 'speculative decoding'.
--
-- No row carries a string tag today (1156 bookmarks, 0 string-tagged), because
-- src/lib/bookmarks/normalize.ts maps ingested tags to objects. This closes the
-- gap for whatever writes next rather than relying on that holding.
--
-- A generated column's expression cannot be altered in place, so the column is
-- dropped and recreated; dropping it also drops idx_bookmarks_search_vector,
-- which is recreated below.

ALTER TABLE "bookmarks" DROP COLUMN IF EXISTS "search_vector";

--> statement-breakpoint
ALTER TABLE "bookmarks" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("description", '')), 'B') ||
  setweight(to_tsvector('english',
    jsonb_path_query_array("tags", '$[*].name')::text || ' ' ||
    jsonb_path_query_array("tags", '$[*] ? (@.type() == "string")')::text), 'B') ||
  setweight(to_tsvector('english', coalesce("summary", '')), 'C') ||
  setweight(to_tsvector('english', coalesce("note", '')), 'D') ||
  setweight(to_tsvector('english', coalesce("scraped_content_text", '')), 'D')
) STORED;

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bookmarks_search_vector"
  ON "bookmarks" USING gin ("search_vector");
