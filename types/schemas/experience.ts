/**
 * Experience Data Schemas
 * @module types/schemas/experience
 * @description
 * Zod schemas for professional experience data validation.
 * These schemas ensure type safety and runtime validation for all experience-related data.
 * @see @link {types/experience.ts}
 */

import { z } from "zod";
import { acceleratorSchema } from "./accelerator";

/**
 * Base schema for experience entry (without refinements for extensibility)
 */
const experienceBaseSchema = z.object({
  /** Unique identifier for the experience entry */
  id: z.string().min(1, "ID is required"),

  /** Company or organization name */
  company: z.string().min(1, "Company name is required"),

  /** Display-friendly date period (e.g., "2023 - Present") */
  period: z.string().min(1, "Period is required"),

  /** ISO date string for when the position started */
  startDate: z.string().datetime({ message: "Start date must be a valid ISO datetime string" }),

  /** ISO date string for when the position ended (undefined for current positions) */
  endDate: z.string().datetime({ message: "End date must be a valid ISO datetime string" }).optional(),

  /** Job title and description */
  role: z.string().min(1, "Role is required"),

  /** Path to company logo image */
  logo: z.string().optional(),

  /** Company website URL */
  website: z.string().url("Website must be a valid URL").optional(),

  /** Associated accelerator program */
  accelerator: acceleratorSchema.optional(),

  /** Company location */
  location: z.string().optional(),

  /**
   * Domain to be used solely for logo and data-matching operations.
   * This is never rendered to end-users. If present it overrides
   * both `website` and fallback company-name logic when fetching
   * logos or other domain-based assets.
   * Example: "callahanplanning.com"
   */
  logoOnlyDomain: z
    .string()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9-_.]*\.[a-zA-Z]{2,}$/, "Must be a valid domain name")
    .optional(),
});

/**
 * Schema for experience entry with structured dates and validation
 */
export const experienceSchema = experienceBaseSchema.refine(
  (data) => {
    // Ensure endDate is after startDate if both are provided
    if (data.endDate && data.startDate) {
      return new Date(data.endDate) >= new Date(data.startDate);
    }
    return true;
  },
  { message: "End date must be after or equal to start date", path: ["endDate"] },
);

/**
 * Schema for processed experience item with logo data
 */
export const processedExperienceItemSchema = experienceBaseSchema.extend({
  logoData: z.object({
    url: z.string().url("Logo URL must be valid"),
    source: z.string().nullable(),
  }),
  error: z.string().optional(),
});

/**
 * Type exports using z.infer for single source of truth
 */
export type Experience = z.infer<typeof experienceSchema>;
export type ProcessedExperienceItem = z.infer<typeof processedExperienceItemSchema>;

/**
 * Validation functions for external data
 */
export const validateExperience = (data: unknown): Experience => {
  return experienceSchema.parse(data);
};

export const validateExperienceArray = (data: unknown): Experience[] => {
  return z.array(experienceSchema).parse(data);
};

export const validateProcessedExperienceItem = (data: unknown): ProcessedExperienceItem => {
  return processedExperienceItemSchema.parse(data);
};
