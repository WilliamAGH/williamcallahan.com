-- Add bookmark tag names and scraped page text to the bookmarks search vector.
--
-- Upstream Karakeep search matches a bookmark's tags and its full page text;
-- the site indexed neither, so queries whose only evidence lived in a tag
-- ("Speculative Decoding") or in the article body returned nothing on the
-- keyword layer and depended entirely on embeddings.
--
-- Weights: tag names sit at B beside the description (curated topical labels);
-- scraped page text sits at D beside the note, the lowest rank contribution.
-- scraped_content_text is capped at 250,000 characters on write
-- (src/lib/bookmarks/scraped-content.ts), so no SQL-side truncation is needed.
--
-- A generated column's expression cannot be altered in place, so the column is
-- dropped and recreated; dropping it also drops idx_bookmarks_search_vector,
-- which is recreated below.

ALTER TABLE "bookmarks" DROP COLUMN IF EXISTS "search_vector";

--> statement-breakpoint
ALTER TABLE "bookmarks" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("description", '')), 'B') ||
  setweight(to_tsvector('english', jsonb_path_query_array("tags", '$[*].name')::text), 'B') ||
  setweight(to_tsvector('english', coalesce("summary", '')), 'C') ||
  setweight(to_tsvector('english', coalesce("note", '')), 'D') ||
  setweight(to_tsvector('english', coalesce("scraped_content_text", '')), 'D')
) STORED;

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bookmarks_search_vector"
  ON "bookmarks" USING gin ("search_vector");
