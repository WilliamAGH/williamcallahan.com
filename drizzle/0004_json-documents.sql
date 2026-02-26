CREATE TABLE "json_documents" (
	"key" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"content_type" text NOT NULL,
	"etag" text,
	"content_length" integer NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_json_documents_updated_at" ON "json_documents" USING btree ("updated_at");
--> statement-breakpoint
CREATE INDEX "idx_json_documents_key" ON "json_documents" USING btree ("key");
