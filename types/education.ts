/**
 * Education Types
 * @module types/education
 * @description
 * Type definitions for education and certification data.
 * All dates are stored in Pacific timezone.
 */

/**
 * Year string in YYYY format
 * @example "2016"
 */
export type YearString = string;

/**
 * Base interface for education-related items
 * @interface
 */
interface EducationBase {
  /** Unique identifier */
  id: string;
  /** Institution name */
  institution: string;
  /** Completion year in YYYY format */
  year?: YearString;
  /** Institution website URL */
  website: string;
  /** Location (city, state) */
  location: string;
  /** Optional logo URL or file path */
  logo?: string;
}

/**
 * Education entry (e.g., degree)
 * @interface
 * @extends {EducationBase}
 */
export interface Education extends EducationBase {
  /** Degree name and specialization */
  degree: string;
}

/**
 * Class entry
 * @interface
 * @extends {EducationBase}
 */
export interface Class extends EducationBase {
  /** Class name */
  name: string;
}

/**
 * Certification entry
 * @interface
 * @extends {EducationBase}
 */
export interface Certification extends EducationBase {
  /** Certification or course name */
  name: string;
}
