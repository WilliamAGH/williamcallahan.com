/**
 * Logo validation schema
 * @module types/schemas/logo-validation
 */

import { z } from "zod/v4";

/**
 * Schema for logo validation API response
 */
export const LogoValidationResponseSchema = z.object({
  isGlobeIcon: z.boolean(),
});

/**
 * Type for logo validation API response
 */
export type LogoValidationResponse = z.infer<typeof LogoValidationResponseSchema>;
