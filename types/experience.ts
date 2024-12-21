/**
 * Experience Types
 * 
 * Type definitions for work experience and career history.
 * Used by experience-related components and data.
 */

export interface Experience {
  /** Unique identifier for the experience entry */
  id: string;
  /** Company or organization name */
  company: string;
  /** Time period of employment/involvement */
  period: string;
  /** Job title and description */
  role: string;
  /** Optional URL to company logo */
  logo?: string;
  /** Optional URL to company website */
  website?: string;
}