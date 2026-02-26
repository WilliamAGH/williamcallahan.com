CREATE TABLE IF NOT EXISTS "github_activity_store" (
	"data_type" text NOT NULL,
	"qualifier" text NOT NULL DEFAULT 'global',
	"payload" jsonb NOT NULL,
	"checksum" text,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "github_activity_store_data_type_qualifier_pk" PRIMARY KEY("data_type","qualifier")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_github_activity_store_type_qualifier" ON "github_activity_store" USING btree ("data_type","qualifier");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_github_activity_store_updated_at" ON "github_activity_store" USING btree ("updated_at");
