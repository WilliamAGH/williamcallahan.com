/**
 * Experience Types
 * @module types/experience
 * @description
 * Types for professional experience entries.
 * Includes structured date fields for SEO and semantic HTML.
 * All dates are stored in Pacific timezone.
 */

import type { Accelerator } from './accelerator';

/**
 * Pacific timezone date string
 * Format: YYYY-MM-DD or ISO string with timezone offset
 * @example
 * "2024-01-01" -> Stored as midnight PT
 * "2024-01-01T08:00:00-08:00" -> Full ISO with PT offset
 */
export type PacificDateString = string;

/**
 * Experience entry with structured dates
 * @see {@link "https://schema.org/JobPosting"} - Schema.org JobPosting specification
 */
export interface Experience {
  /** Unique identifier for the experience entry */
  id: string;
  /** Company or organization name */
  company: string;
  /** @deprecated Use startDate and endDate instead - period is now generated dynamically */
  period?: string;
  /** Pacific timezone date string for when the position started */
  startDate: PacificDateString;
  /** Pacific timezone date string for when the position ended (undefined for current positions) */
  endDate?: PacificDateString;
  /** Job title and description */
  role: string;
  /** Path to company logo image */
  logo?: string;
  /** Company website URL */
  website?: string;
  /** Associated accelerator program */
  accelerator?: Accelerator;
  /** Company location */
  location?: string;
}

/**
 * Schema.org JobPosting metadata
 * Used in JSON-LD structured data
 * @see {@link "https://schema.org/JobPosting"} - Schema.org JobPosting specification
 */
export interface JobPostingSchema {
  '@context': 'https://schema.org';
  '@type': 'JobPosting';
  title: string;
  description: string;
  datePosted: string;
  validThrough?: string;
  employmentType: 'FULL_TIME';
  hiringOrganization: {
    '@type': 'Organization';
    name: string;
    sameAs?: string;
    logo?: string;
  };
  jobLocation: {
    '@type': 'Place';
    address: {
      '@type': 'PostalAddress';
      addressLocality: string;
      addressRegion: string;
      addressCountry: 'US';
    };
  };
}
