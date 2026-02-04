/**
 * Failure Tracker Schemas
 * @module types/schemas/failure-tracker
 */

import { z } from "zod/v4";

export const failureRecordBaseSchema = z.object({
  attempts: z.number(),
  lastAttempt: z.number(),
  permanentFailure: z.boolean().optional(),
  reason: z.string().optional(),
});

export type FailureRecordBase = z.infer<typeof failureRecordBaseSchema>;

export const createFailedItemSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  failureRecordBaseSchema.extend({
    item: itemSchema,
  });

export const createFailedItemRecordSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.record(z.string(), createFailedItemSchema(itemSchema));
