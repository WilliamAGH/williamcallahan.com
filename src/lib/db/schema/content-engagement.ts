/**
 * Engagement tracking table for content discovery scoring.
 *
 * Records impression, click, dwell, and external_click events per content item.
 * Aggregated by discovery-scores.ts into feed ranking signals.
 */

import { bigserial, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { ENGAGEMENT_CONTENT_TYPES, ENGAGEMENT_EVENT_TYPES } from "@/types/schemas/engagement";

export const contentEngagement = pgTable(
  "content_engagement",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    contentType: text("content_type").$type<(typeof ENGAGEMENT_CONTENT_TYPES)[number]>().notNull(),
    contentId: text("content_id").notNull(),
    eventType: text("event_type").$type<(typeof ENGAGEMENT_EVENT_TYPES)[number]>().notNull(),
    durationMs: integer("duration_ms"),
    visitorHash: text("visitor_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_engagement_content").on(table.contentType, table.contentId),
    index("idx_engagement_scoring").on(table.contentType, table.eventType, table.createdAt),
    // Covering index created via raw SQL migration (drizzle/0023_engagement-covering-index.sql)
    // with INCLUDE(event_type, duration_ms) for Index Only Scans.
    // Drizzle ORM 0.45.x lacks .include() — declare key columns only.
    index("idx_engagement_covering").on(table.contentType, table.createdAt, table.contentId),
    index("idx_engagement_visitor").on(table.visitorHash, table.createdAt),
  ],
);
