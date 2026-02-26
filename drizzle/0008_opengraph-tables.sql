CREATE TABLE "opengraph_metadata" (
	"url_hash" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"payload" jsonb NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opengraph_overrides" (
	"url_hash" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"payload" jsonb NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_opengraph_metadata_updated_at" ON "opengraph_metadata" USING btree ("updated_at");
--> statement-breakpoint
CREATE INDEX "idx_opengraph_overrides_updated_at" ON "opengraph_overrides" USING btree ("updated_at");
