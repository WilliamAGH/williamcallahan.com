/**
 * Checksum Schemas
 * @module types/schemas/checksum
 */

import { z } from "zod/v4";

export const checksumRecordSchema = z.object({
  checksum: z.string().min(1),
});

export type ChecksumRecord = z.infer<typeof checksumRecordSchema>;

export const checksumKeyRecordSchema = z.object({
  checksum: z.string().min(1),
  key: z.string().min(1),
});

export type ChecksumKeyRecord = z.infer<typeof checksumKeyRecordSchema>;
