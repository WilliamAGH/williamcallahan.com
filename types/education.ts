/**
 * Education Types
 * Defines types for educational institutions and certifications
 */

/**
 * Represents an educational institution entry
 */
export interface Education {
  /** Unique identifier for the education entry */
  id: string;
  /** Name of the educational institution */
  institution: string;
  /** Degree or qualification earned */
  degree: string;
  /** Year or period of study */
  year: string;
  /** Optional URL to the institution's logo */
  logo?: string;
  /** Optional URL to the institution's website */
  website?: string;
}

/**
 * Represents a professional certification
 */
export interface Certification {
  /** Unique identifier for the certification */
  id: string;
  /** Institution that issued the certification */
  institution: string;
  /** Name of the certification */
  name: string;
  /** Year the certification was earned */
  year: string;
  /** Optional URL to the certification logo */
  logo?: string;
  /** Optional URL to verify the certification or institution website */
  website?: string;
}
