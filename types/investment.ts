/**
 * Investment Types
 */

import type { Accelerator } from "./accelerator";
import type { LogoData } from "./logo";

import type { JSX } from "react";

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
  /** Year company was founded */
  founded_year?: string | null;
  /** Year of investment */
  invested_year: string;
  /** Year company shut down (if applicable) */
  shutdown_year?: string | null;
  /** Year company was acquired (if applicable) */
  acquired_year?: string | null;
  /** Current investment status */
  status: "Active" | "Realized";
  /** Company operating status */
  operating_status: "Operating" | "Shut Down" | "Acquired" | "Inactive";
  /** Company logo URL */
  logo?: string | null;
  /** Company website */
  website?: string | null;
  /** aVenture URL for Company */
  aventure_url?: string | null;
  /**
   * Domain to be used solely for logo and data-matching operations.
   * Never rendered to users. When present this overrides `website` when
   * resolving logos or domain-based assets.
   */
  logoOnlyDomain?: string | null;
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
  /** Additional metadata for the investment */
  // metadata?: InvestmentMetadata;
}

/**
 * Props for the ThemeWrapper client component.
 */
export interface ThemeWrapperProps {
  investment: Investment;
  logoData: LogoData;
  renderedMetrics: JSX.Element;
}

/** Investment URL validation result with detailed checks */
export interface InvestmentUrlValidationResult {
  investment: Investment;
  url: string;
  isValidFormat: boolean;
  isReachable: boolean;
  httpStatus?: number;
  responseTime?: number;
  errorType?: string;
  redirectUrl?: string;
  hasSSL?: boolean;
}
