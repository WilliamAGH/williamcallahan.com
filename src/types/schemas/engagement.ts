/**
 * Engagement Event Schemas
 * @module types/schemas/engagement
 * @description
 * Zod v4 schemas and shared enum constants for validating engagement events
 * (impression, click, dwell, external_click) sent from client to POST /api/engagement.
 */

import { z } from "zod/v4";

export const ENGAGEMENT_EVENT_TYPES = ["impression", "click", "dwell", "external_click"] as const;

export const ENGAGEMENT_CONTENT_TYPES = [
  "bookmark",
  "blog",
  "book",
  "investment",
  "project",
  "thought",
] as const;

export type EngagementEventType = (typeof ENGAGEMENT_EVENT_TYPES)[number];
export type EngagementContentType = (typeof ENGAGEMENT_CONTENT_TYPES)[number];

export const engagementEventSchema = z.object({
  contentType: z.enum(ENGAGEMENT_CONTENT_TYPES),
  contentId: z.string().min(1).max(500),
  eventType: z.enum(ENGAGEMENT_EVENT_TYPES),
  durationMs: z.number().int().min(0).max(3_600_000).optional(),
});

export const engagementBatchSchema = z.object({
  events: z.array(engagementEventSchema).min(1).max(100),
});

export type EngagementEvent = z.infer<typeof engagementEventSchema>;
export type EngagementBatch = z.infer<typeof engagementBatchSchema>;
