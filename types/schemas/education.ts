/**
 * Education Data Schemas
 * @module types/schemas/education
 * @description
 * Zod schemas for education and certification data validation.
 * These schemas ensure type safety and runtime validation for all education-related data.
 * @see @link {types/education.ts}
 */

import { z } from "zod";

/**
 * Base schema for education-related items
 * Validates common fields across all education types
 */
const educationBaseSchema = z.object({
  /** Unique identifier */
  id: z.string().min(1, "ID is required"),

  /** Institution name */
  institution: z.string().min(1, "Institution name is required"),

  /** Year completed - must be a reasonable year */
  year: z
    .number()
    .int("Year must be an integer")
    .min(1900, "Year must be after 1900")
    .max(new Date().getFullYear() + 10, "Year cannot be more than 10 years in the future"),

  /** Institution website URL */
  website: z.string().url("Website must be a valid URL"),

  /** Location (city, state) */
  location: z.string().min(1, "Location is required"),

  /** Optional logo URL or file path */
  logo: z.string().optional(),

  /** Optional scaling factor for the logo (0.1 to 2.0) */
  logoScale: z
    .number()
    .min(0.1, "Logo scale must be at least 0.1")
    .max(2.0, "Logo scale must be at most 2.0")
    .optional(),
});

/**
 * Schema for education entry (e.g., degree)
 */
export const educationSchema = educationBaseSchema.extend({
  /** Degree name and specialization */
  degree: z.string().min(1, "Degree name is required"),
});

/**
 * Schema for class entry
 */
export const classSchema = educationBaseSchema.extend({
  /** Class name */
  name: z.string().min(1, "Class name is required"),
});

/**
 * Schema for certification entry
 */
export const certificationSchema = educationBaseSchema.extend({
  /** Certification or course name */
  name: z.string().min(1, "Certification name is required"),
});

/**
 * Schema for processed logo data
 */
export const educationLogoDataSchema = z.object({
  url: z.string().url("Logo URL must be valid"),
  source: z.string().nullable(),
  needsInversion: z.boolean().optional(),
});

/**
 * Schema for education table item (course or certification with logo data)
 */
export const educationTableItemSchema = z.union([
  classSchema.extend({
    logoData: educationLogoDataSchema,
    type: z.literal("course"),
  }),
  certificationSchema.extend({
    logoData: educationLogoDataSchema,
    type: z.literal("certification"),
  }),
]);

/**
 * Schema for processed education item with logo data and error field
 */
export const processedEducationItemSchema = educationSchema.extend({
  logoData: educationLogoDataSchema,
  error: z.string().optional(),
});

/**
 * Schema for processed class item with logo data and error field
 */
export const processedClassItemSchema = classSchema.extend({
  logoData: educationLogoDataSchema,
  error: z.string().optional(),
});

/**
 * Schema for processed certification item with logo data and error field
 */
export const processedCertificationItemSchema = certificationSchema.extend({
  logoData: educationLogoDataSchema,
  error: z.string().optional(),
});

/**
 * Schema for the main education client props
 */
export const educationClientPropsSchema = z.object({
  education: z.array(processedEducationItemSchema),
  recentCourses: z.array(educationTableItemSchema.refine((item) => item.type === "course", "Must be a course item")),
  recentCertifications: z.array(
    educationTableItemSchema.refine((item) => item.type === "certification", "Must be a certification item"),
  ),
});

/**
 * Schema for education card client props
 */
export const educationCardClientPropsSchema = z.object({
  education: educationSchema.extend({
    logoData: educationLogoDataSchema,
  }),
  className: z.string().optional(),
});

/**
 * Schema for certification card client props
 */
export const certificationCardClientPropsSchema = z.object({
  certification: certificationSchema,
  className: z.string().optional(),
});

/**
 * Type exports using z.infer for single source of truth
 */
export type Education = z.infer<typeof educationSchema>;
export type Class = z.infer<typeof classSchema>;
export type Certification = z.infer<typeof certificationSchema>;
export type EducationLogoData = z.infer<typeof educationLogoDataSchema>;
export type EducationTableItem = z.infer<typeof educationTableItemSchema>;
export type ProcessedEducationItem = z.infer<typeof processedEducationItemSchema>;
export type ProcessedClassItem = z.infer<typeof processedClassItemSchema>;
export type ProcessedCertificationItem = z.infer<typeof processedCertificationItemSchema>;
export type EducationClientProps = z.infer<typeof educationClientPropsSchema>;
export type EducationCardClientProps = z.infer<typeof educationCardClientPropsSchema>;
export type CertificationCardClientProps = z.infer<typeof certificationCardClientPropsSchema>;

/**
 * Validation functions for external data
 */
export const validateEducation = (data: unknown): Education => {
  return educationSchema.parse(data);
};

export const validateClass = (data: unknown): Class => {
  return classSchema.parse(data);
};

export const validateCertification = (data: unknown): Certification => {
  return certificationSchema.parse(data);
};

export const validateEducationArray = (data: unknown): Education[] => {
  return z.array(educationSchema).parse(data);
};

export const validateClassArray = (data: unknown): Class[] => {
  return z.array(classSchema).parse(data);
};

export const validateCertificationArray = (data: unknown): Certification[] => {
  return z.array(certificationSchema).parse(data);
};
