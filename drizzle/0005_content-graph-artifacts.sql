CREATE TABLE "content_graph_artifacts" (
	"artifact_type" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"generated_at" text NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_content_graph_artifacts_updated_at" ON "content_graph_artifacts" USING btree ("updated_at");
