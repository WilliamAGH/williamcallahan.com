/**
 * Experience Types
 * @module types/experience
 * @description
 * Types for professional experience entries.
 * Includes structured date fields for SEO and semantic HTML.
 */

import type { Accelerator } from './accelerator';

/**
 * Experience entry with structured dates
 * @see {@link "https://schema.org/JobPosting"} - Schema.org JobPosting specification
 */
export interface Experience {
  /** Unique identifier for the experience entry */
  id: string;
  /** Company or organization name */
  company: string;
  /** Display-friendly date period (e.g., "2023 - Present") */
  period: string;
  /** ISO date string for when the position started */
  startDate: string;
  /** ISO date string for when the position ended (undefined for current positions) */
  endDate?: string;
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
