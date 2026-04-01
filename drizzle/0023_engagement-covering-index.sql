-- Drop the previous index
DROP INDEX IF EXISTS "idx_engagement_scoring_composite";

-- Create a covering index for Index Only Scans
-- This includes the columns used in the GROUP BY and aggregate functions
CREATE INDEX "idx_engagement_covering" ON "content_engagement" ("content_type", "created_at", "content_id")
INCLUDE ("event_type", "duration_ms");
