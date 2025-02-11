/**
 * Investment Types
 * @module types/investment
 * @description
 * Type definitions for investment data.
 * All dates are stored in Pacific timezone.
 */

import type { Accelerator } from './accelerator';
import { PacificDateString } from './seo/shared';

/**
 * Financial metrics for an investment
 */
export interface InvestmentMetrics {
  /** Investment multiple (e.g., 2.5x) */
  multiple: number;
  /** Holding period return */
  holding_return: number;
  /** Additional metrics */
  [key: string]: number;
}

/**
 * Investment details
 */
export interface Investment {
  /** Unique identifier */
  id: string;
  /** Company name */
  name: string;
  /** Company description */
  description: string;
  /** Investment type */
  type: string;
  /** Investment stage */
  stage: string;
  /** Business category */
  category?: string;
  /** Date company was founded (stored as end of year in PT) */
  founded_year?: PacificDateString | null;
  /** Date of investment (stored as end of year in PT) */
  invested_year: PacificDateString;
  /** Date company shut down (stored as end of year in PT) */
  shutdown_year?: PacificDateString | null;
  /** Date company was acquired (stored as end of year in PT) */
  acquired_year?: PacificDateString | null;
  /** Current investment status */
  status: 'Active' | 'Realized';
  /** Company operating status */
  operating_status: 'Operating' | 'Shut Down' | 'Acquired';
  /** Company logo URL */
  logo?: string | null;
  /** Company website */
  website?: string;
  /** Location (city, state) */
  location?: string;
  /** Investment metrics */
  metrics?: InvestmentMetrics;
  /** Investment multiple */
  multiple: number;
  /** Holding period return */
  holding_return: number;
  /** Associated accelerator */
  accelerator?: Accelerator | null;
  /** Additional details */
  details?: {
    label: string;
    value: string;
  }[];
}
