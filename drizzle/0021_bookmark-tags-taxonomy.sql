CREATE TABLE IF NOT EXISTS "bookmarks_tags" (
	"tag_slug" text PRIMARY KEY NOT NULL,
	"tag_name" text NOT NULL,
	"tag_status" text DEFAULT 'primary' NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "bookmarks_tags_status_check" CHECK ("tag_status" IN ('primary', 'alias'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bookmarks_tags_status"
	ON "bookmarks_tags" USING btree ("tag_status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bookmarks_tags_links" (
	"source_tag_slug" text NOT NULL,
	"target_tag_slug" text NOT NULL,
	"link_type" text DEFAULT 'alias' NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "bookmarks_tags_links_pk" PRIMARY KEY("source_tag_slug","target_tag_slug"),
	CONSTRAINT "bookmarks_tags_links_type_check" CHECK ("link_type" IN ('alias')),
	CONSTRAINT "bookmarks_tags_links_distinct_check" CHECK ("source_tag_slug" <> "target_tag_slug")
);
--> statement-breakpoint
ALTER TABLE "bookmarks_tags_links"
	ADD CONSTRAINT "bookmarks_tags_links_source_fk"
	FOREIGN KEY ("source_tag_slug")
	REFERENCES "public"."bookmarks_tags"("tag_slug")
	ON DELETE cascade
	ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "bookmarks_tags_links"
	ADD CONSTRAINT "bookmarks_tags_links_target_fk"
	FOREIGN KEY ("target_tag_slug")
	REFERENCES "public"."bookmarks_tags"("tag_slug")
	ON DELETE cascade
	ON UPDATE cascade;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bookmarks_tags_links_source"
	ON "bookmarks_tags_links" USING btree ("source_tag_slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bookmarks_tags_links_target"
	ON "bookmarks_tags_links" USING btree ("target_tag_slug");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_bookmarks_tags_links_source_alias"
	ON "bookmarks_tags_links" USING btree ("source_tag_slug")
	WHERE "link_type" = 'alias';
--> statement-breakpoint
INSERT INTO "bookmarks_tags" ("tag_slug", "tag_name", "tag_status", "created_at", "updated_at")
SELECT
	btl."tag_slug",
	min(btl."tag_name") AS "tag_name",
	'primary' AS "tag_status",
	(extract(epoch from now()) * 1000)::bigint AS "created_at",
	(extract(epoch from now()) * 1000)::bigint AS "updated_at"
FROM "bookmark_tag_links" AS btl
GROUP BY btl."tag_slug"
ON CONFLICT ("tag_slug") DO UPDATE
SET
	"tag_name" = EXCLUDED."tag_name",
	"updated_at" = EXCLUDED."updated_at";
--> statement-breakpoint
INSERT INTO "bookmarks_tags" ("tag_slug", "tag_name", "tag_status", "created_at", "updated_at")
SELECT
	bc."category_slug" AS "tag_slug",
	bc."category_name" AS "tag_name",
	bc."tag_status" AS "tag_status",
	bc."created_at" AS "created_at",
	bc."updated_at" AS "updated_at"
FROM "bookmark_categories" AS bc
ON CONFLICT ("tag_slug") DO UPDATE
SET
	"tag_name" = EXCLUDED."tag_name",
	"tag_status" = CASE
		WHEN EXCLUDED."tag_status" = 'alias' THEN 'alias'
		ELSE "bookmarks_tags"."tag_status"
	END,
	"updated_at" = EXCLUDED."updated_at";
--> statement-breakpoint
INSERT INTO "bookmarks_tags_links" (
	"source_tag_slug",
	"target_tag_slug",
	"link_type",
	"created_at",
	"updated_at"
)
SELECT
	bc."category_slug" AS "source_tag_slug",
	bc."canonical_slug" AS "target_tag_slug",
	'alias' AS "link_type",
	bc."created_at" AS "created_at",
	bc."updated_at" AS "updated_at"
FROM "bookmark_categories" AS bc
INNER JOIN "bookmarks_tags" AS canonical
	ON canonical."tag_slug" = bc."canonical_slug"
	AND canonical."tag_status" = 'primary'
WHERE bc."tag_status" = 'alias'
	AND bc."canonical_slug" IS NOT NULL
	AND bc."canonical_slug" <> bc."category_slug"
ON CONFLICT ("source_tag_slug", "target_tag_slug") DO UPDATE
SET
	"updated_at" = EXCLUDED."updated_at";
--> statement-breakpoint
DROP TABLE IF EXISTS "bookmark_categories";
