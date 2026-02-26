CREATE TABLE "ai_analysis_latest" (
	"domain" text NOT NULL,
	"entity_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"generated_at" text NOT NULL,
	"model_version" text NOT NULL,
	"content_hash" text,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "ai_analysis_latest_pk" PRIMARY KEY("domain","entity_id")
);
--> statement-breakpoint
CREATE TABLE "ai_analysis_versions" (
	"domain" text NOT NULL,
	"entity_id" text NOT NULL,
	"generated_at" text NOT NULL,
	"payload" jsonb NOT NULL,
	"model_version" text NOT NULL,
	"content_hash" text,
	"created_at" bigint NOT NULL,
	CONSTRAINT "ai_analysis_versions_pk" PRIMARY KEY("domain","entity_id","generated_at")
);
--> statement-breakpoint
CREATE INDEX "idx_ai_analysis_latest_domain" ON "ai_analysis_latest" USING btree ("domain");
--> statement-breakpoint
CREATE INDEX "idx_ai_analysis_latest_updated_at" ON "ai_analysis_latest" USING btree ("updated_at");
--> statement-breakpoint
CREATE INDEX "idx_ai_analysis_versions_domain_entity" ON "ai_analysis_versions" USING btree ("domain","entity_id");
