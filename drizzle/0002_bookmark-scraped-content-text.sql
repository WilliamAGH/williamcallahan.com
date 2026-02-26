ALTER TABLE "bookmarks" DROP COLUMN IF EXISTS "embedding";--> statement-breakpoint
ALTER TABLE "bookmarks" ADD COLUMN "scraped_content_text" text;
