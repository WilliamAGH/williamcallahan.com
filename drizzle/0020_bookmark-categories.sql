CREATE TABLE IF NOT EXISTS "bookmark_categories" (
	"category_slug" text PRIMARY KEY NOT NULL,
	"category_name" text NOT NULL,
	"tag_status" text DEFAULT 'primary' NOT NULL,
	"canonical_slug" text,
	"bookmark_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "bookmark_categories_tag_status_check"
		CHECK ("tag_status" IN ('primary', 'alias')),
	CONSTRAINT "bookmark_categories_alias_requires_canonical_check"
		CHECK (
			("tag_status" = 'primary' AND "canonical_slug" IS NULL)
			OR
			(
				"tag_status" = 'alias'
				AND "canonical_slug" IS NOT NULL
				AND "canonical_slug" <> "category_slug"
			)
		)
);
--> statement-breakpoint
ALTER TABLE "bookmark_categories"
	ADD CONSTRAINT "bookmark_categories_canonical_slug_fk"
	FOREIGN KEY ("canonical_slug")
	REFERENCES "public"."bookmark_categories"("category_slug")
	ON DELETE restrict
	ON UPDATE cascade;
--> statement-breakpoint
CREATE INDEX "idx_bookmark_categories_status"
	ON "bookmark_categories" USING btree ("tag_status");
--> statement-breakpoint
CREATE INDEX "idx_bookmark_categories_canonical_slug"
	ON "bookmark_categories" USING btree ("canonical_slug");
--> statement-breakpoint
CREATE INDEX "idx_bookmark_categories_bookmark_ids"
	ON "bookmark_categories" USING gin ("bookmark_ids");
