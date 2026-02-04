/**
 * Rate Limit Schemas
 * @module types/schemas/rate-limit
 */

import { z } from "zod/v4";

export const rateLimitRecordSchema = z.object({
  count: z.number(),
  resetAt: z.number(),
});

export type RateLimitRecordFromSchema = z.infer<typeof rateLimitRecordSchema>;

export const rateLimitStoreSchema = z.record(z.string(), rateLimitRecordSchema);

export type RateLimitStoreFromSchema = z.infer<typeof rateLimitStoreSchema>;
