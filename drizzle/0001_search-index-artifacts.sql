CREATE TABLE "search_index_artifacts" (
	"domain" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"item_count" integer NOT NULL,
	"generated_at" text NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_search_index_artifacts_updated_at" ON "search_index_artifacts" USING btree ("updated_at");
