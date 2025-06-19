/**
 * GitHub Feature Component Props
 *
 * SCOPE: GitHub-specific component props and interfaces
 * USAGE: Use for GitHub activity, stats, repositories, and related UI components
 * OVERLAP PREVENTION: Do NOT add generic UI props (use types/ui.ts)
 * DO NOT add other feature domains (use separate feature files)
 *
 * DRY PRINCIPLE: When creating component props, prefer extending/reusing types from
 * the core domain model (types/github.ts) rather than recreating similar structures.
 * Example: Use `activity: GitHubActivity[]` instead of redefining activity properties inline.
 *
 * @see types/github.ts for GitHub domain models and data types
 * @see types/ui.ts for generic UI component props
 */

import type { ReactNode } from "react";
import type { ContributionDay } from "../github";

/**
 * GitHub activity component props
 * @usage - Displaying GitHub activity feeds and timelines
 */
export interface GitHubActivityProps {
  /** GitHub activity data */
  activity: ContributionDay[];
  /** Maximum items to show */
  maxItems?: number;
  /** Optional CSS classes */
  className?: string;
}

/**
 * GitHub statistics data structure containing cumulative metrics
 * @usage - Core data structure for GitHub statistics display
 */
export interface GitHubStats {
  /** Total number of contributions across all repositories */
  totalContributions: number;
  /** Total lines of code added */
  linesAdded: number;
  /** Total lines of code removed */
  linesRemoved: number;
  /** Net lines of code (added minus removed) */
  netLinesOfCode: number;
}

/**
 * GitHub stats card data structure
 * @usage - Individual stat card within stats collection
 */
export interface CumulativeGitHubStatsCard {
  /** Card title */
  title: string;
  /** Card value */
  value: number | string;
  /** Card icon */
  icon?: ReactNode;
  /** Card description */
  description?: string;
}

/**
 * GitHub stats cards component props
 * @usage - Displaying cumulative GitHub statistics
 */
export interface CumulativeGitHubStatsCardsProps {
  /** GitHub statistics data to display */
  stats: GitHubStats;
  /** Optional additional CSS class names */
  className?: string;
}

/**
 * API Error response structure
 * @usage - Handling GitHub API error responses
 */
export interface ApiError {
  message?: string;
  error?: string;
}
