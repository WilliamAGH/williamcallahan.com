/**
 * Experience Types
 * @module types/experience
 * @description
 * Types for professional experience entries.
 * Includes structured date fields for SEO and semantic HTML.
 * These types are derived from Zod schemas for runtime validation.
 * @see @link {types/schema/experience.ts}
 */

// Re-export all types from the schema file for single source of truth
export type { Experience, ProcessedExperienceItem } from "./schemas/experience";

// Re-export validation functions for convenience
export { validateExperience, validateExperienceArray, validateProcessedExperienceItem } from "./schemas/experience";
