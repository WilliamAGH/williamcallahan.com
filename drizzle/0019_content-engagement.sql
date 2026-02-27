-- Content engagement tracking for discovery feed scoring.
-- Records impression, click, dwell, and external_click events per content item.

CREATE TABLE IF NOT EXISTS "content_engagement" (
  "id" bigserial PRIMARY KEY,
  "content_type" text NOT NULL,
  "content_id" text NOT NULL,
  "event_type" text NOT NULL,
  "duration_ms" integer,
  "visitor_hash" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "content_engagement_content_type_check" CHECK (
    "content_type" IN ('bookmark', 'blog', 'book', 'investment', 'project', 'thought')
  ),
  CONSTRAINT "content_engagement_event_type_check" CHECK (
    "event_type" IN ('impression', 'click', 'dwell', 'external_click')
  )
);

-->  statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_engagement_content"
  ON "content_engagement" ("content_type", "content_id");

-->  statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_engagement_scoring"
  ON "content_engagement" ("content_type", "event_type", "created_at");

-->  statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_engagement_visitor"
  ON "content_engagement" ("visitor_hash", "created_at");
