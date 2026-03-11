/**
 * Rate Limit Schemas
 * @module types/schemas/rate-limit
 */

import { z } from "zod/v4";

export const rateLimitRecordSchema = z.object({
  count: z.number(),
  resetAt: z.number(),
});

export type RateLimitEntry = z.infer<typeof rateLimitRecordSchema>;

export const rateLimitStoreSchema = z.record(z.string(), rateLimitRecordSchema);

export type RateLimitStore = z.infer<typeof rateLimitStoreSchema>;
