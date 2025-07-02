/**
 * Education Types
 * @module types/education
 * @description
 * Type definitions for education and certification data.
 * These types are derived from Zod schemas for runtime validation.
 * @see @link {types/schemas/education.ts}
 */

// Re-export all types from the schema file for single source of truth
export type {
  Education,
  Class,
  Certification,
  EducationLogoData,
  EducationTableItem,
  ProcessedEducationItem,
  ProcessedClassItem,
  ProcessedCertificationItem,
  EducationClientProps,
  EducationCardClientProps,
  CertificationCardClientProps,
} from "./schemas/education";

// Re-export validation functions for convenience
export {
  validateEducation,
  validateClass,
  validateCertification,
  validateEducationArray,
  validateClassArray,
  validateCertificationArray,
} from "./schemas/education";
