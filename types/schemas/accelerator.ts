/**
 * Accelerator Data Schemas
 * @module types/schemas/accelerator
 * @description
 * Zod schemas for accelerator program data validation.
 * @see @link {types/accelerator.ts}
 */

import { z } from "zod";

/**
 * Schema for accelerator programs
 */
export const acceleratorSchema = z.object({
  program: z.enum(["techstars", "ycombinator"], {
    errorMap: () => ({ message: "Program must be either 'techstars' or 'ycombinator'" }),
  }),
  batch: z.string().min(1, "Batch is required"),
  location: z.string().min(1, "Location is required"),
  /** Optional logo URL or file path */
  logo: z.string().optional(),
});

/**
 * Type export using z.infer for single source of truth
 */
export type Accelerator = z.infer<typeof acceleratorSchema>;

/**
 * Validation function for external data
 */
export const validateAccelerator = (data: unknown): Accelerator => {
  return acceleratorSchema.parse(data);
};