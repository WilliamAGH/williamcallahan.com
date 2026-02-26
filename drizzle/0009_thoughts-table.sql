CREATE TABLE "thoughts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint,
	"category" text,
	"tags" text[],
	"draft" boolean DEFAULT false,
	"related_thoughts" uuid[]
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_thoughts_slug" ON "thoughts" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX "idx_thoughts_category" ON "thoughts" USING btree ("category");
--> statement-breakpoint
CREATE INDEX "idx_thoughts_created_at" ON "thoughts" USING btree ("created_at");
