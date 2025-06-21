/**
 * Education Types
 * @module types/education
 * @description
 * Type definitions for education and certification data.
 */

/**
 * Base interface for education-related items
 * @interface
 */
interface EducationBase {
  /** Unique identifier */
  id: string;
  /** Institution name */
  institution: string;
  /** Year completed */
  year: number;
  /** Institution website URL */
  website: string;
  /** Location (city, state) */
  location: string;
  /** Optional logo URL or file path */
  logo?: string;
  /** Optional scaling factor for the logo (e.g., 0.9 for 90%) */
  logoScale?: number;
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

/**
 * Represents the processed logo data for an education or certification item.
 */
export interface EducationLogoData {
  url: string;
  source: string | null;
}

/**
 * A union type representing an item in the education table, which can be a course or a certification.
 * It includes processed logo data.
 */
export type EducationTableItem = (Class | Certification) & {
  logoData: EducationLogoData;
  type: "course" | "certification";
};

/**
 * Props for the main client-side Education component.
 */
export interface EducationClientProps {
  education: (Education & { logoData: EducationLogoData })[];
  recentCourses: EducationTableItem[];
  recentCertifications: EducationTableItem[];
}

/**
 * Props for the client-side EducationCard component.
 */
export interface EducationCardClientProps {
  education: Education & { logoData: EducationLogoData };
  className?: string;
}

/**
 * Props for the client-side CertificationCard component.
 */
export interface CertificationCardClientProps {
  certification: Certification;
  className?: string;
}
