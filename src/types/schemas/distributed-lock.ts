/**
 * Distributed Lock Schemas
 * @module types/schemas/distributed-lock
 */

import { z } from "zod/v4";

export const distributedLockEntrySchema = z.object({
  instanceId: z.string().min(1),
  acquiredAt: z.number(),
  ttlMs: z.number(),
});

export type DistributedLockEntryFromSchema = z.infer<typeof distributedLockEntrySchema>;
