CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "bookmark_index_state" (
	"id" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"total_pages" integer NOT NULL,
	"page_size" integer NOT NULL,
	"last_modified" text NOT NULL,
	"last_fetched_at" bigint NOT NULL,
	"last_attempted_at" bigint NOT NULL,
	"checksum" text NOT NULL,
	"change_detected" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookmark_tag_index_state" (
	"tag_slug" text PRIMARY KEY NOT NULL,
	"tag_name" text NOT NULL,
	"count" integer NOT NULL,
	"total_pages" integer NOT NULL,
	"page_size" integer NOT NULL,
	"last_modified" text NOT NULL,
	"last_fetched_at" bigint NOT NULL,
	"last_attempted_at" bigint NOT NULL,
	"checksum" text NOT NULL,
	"change_detected" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookmark_tag_links" (
	"bookmark_id" text NOT NULL,
	"tag_slug" text NOT NULL,
	"tag_name" text NOT NULL,
	"date_bookmarked" text NOT NULL,
	CONSTRAINT "bookmark_tag_links_pk" PRIMARY KEY("bookmark_id","tag_slug")
);
--> statement-breakpoint
CREATE TABLE "bookmarks" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"note" text,
	"summary" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content" jsonb,
	"assets" jsonb,
	"logo_data" jsonb,
	"registry_links" jsonb,
	"og_image" text,
	"og_title" text,
	"og_description" text,
	"og_url" text,
	"og_image_external" text,
	"og_image_last_fetched_at" text,
	"og_image_etag" text,
	"reading_time" integer,
	"word_count" integer,
	"archived" boolean DEFAULT false NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"tagging_status" text,
	"domain" text,
	"date_bookmarked" text NOT NULL,
	"date_published" text,
	"date_created" text,
	"date_updated" text,
	"modified_at" text,
	"source_updated_at" text NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce("bookmarks"."title", '')), 'A') ||
        setweight(to_tsvector('english', coalesce("bookmarks"."description", '')), 'B') ||
        setweight(to_tsvector('english', coalesce("bookmarks"."summary", '')), 'C') ||
        setweight(to_tsvector('english', coalesce("bookmarks"."note", '')), 'D')
      ) STORED,
	"qwen_4b_fp16_embedding" halfvec(2560),
	CONSTRAINT "bookmarks_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "bookmark_tag_links" ADD CONSTRAINT "bookmark_tag_links_bookmark_id_bookmarks_id_fk" FOREIGN KEY ("bookmark_id") REFERENCES "public"."bookmarks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_bookmark_tag_index_state_tag_name" ON "bookmark_tag_index_state" USING btree ("tag_name");--> statement-breakpoint
CREATE INDEX "idx_bookmark_tag_links_slug_date" ON "bookmark_tag_links" USING btree ("tag_slug","date_bookmarked","bookmark_id");--> statement-breakpoint
CREATE INDEX "idx_bookmark_tag_links_bookmark" ON "bookmark_tag_links" USING btree ("bookmark_id");--> statement-breakpoint
CREATE INDEX "idx_bookmarks_search_vector" ON "bookmarks" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "idx_bookmarks_qwen_4b_fp16_embedding" ON "bookmarks" USING hnsw ("qwen_4b_fp16_embedding" halfvec_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_bookmarks_title_trgm" ON "bookmarks" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_bookmarks_slug_trgm" ON "bookmarks" USING gin ("slug" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_bookmarks_domain" ON "bookmarks" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "idx_bookmarks_date_bookmarked" ON "bookmarks" USING btree ("date_bookmarked");--> statement-breakpoint
COMMENT ON COLUMN "bookmarks"."qwen_4b_fp16_embedding" IS 'Qwen3-Embedding-4B FP16 (2560-d halfvec). Model: Qwen/Qwen3-Embedding-4B. GGUF: https://huggingface.co/Qwen/Qwen3-Embedding-4B-GGUF?show_file_info=Qwen3-Embedding-4B-f16.gguf — DO NOT populate with any other model or quantization.';
