/**
 * GitHub Activity Types
 *
 * Type definitions for fetching and displaying GitHub contribution data.
 */

/**
 * Represents a single day of contribution activity.
 */
export interface ContributionDay {
  date: string;
  count: number;
  level: number; // GitHub's contribution level (0-4)
}

/**
 * Represents the structure of the response from the
 * `/api/github-activity` endpoint.
 */
export interface GitHubActivityApiResponse {
  source: 'scraping' | 'api'; // Indicates how the data was obtained
  data: ContributionDay[];
  totalContributions?: string; // Optional total count (especially from scraping)
  linesAdded?: number; // Total lines of code added in the last 365 days
  linesRemoved?: number; // Total lines of code removed in the last 365 days
  error?: string; // Error message if fetching failed
  details?: string; // Additional error details
}

/**
 * Represents the raw structure of the response from the
 * GitHub GraphQL API for contribution calendar data.
 */
export interface GitHubGraphQLContributionResponse {
  user: {
    contributionsCollection: {
      contributionCalendar: {
        totalContributions: number;
        weeks: Array<{
          contributionDays: Array<{
            contributionCount: number;
            contributionLevel: string; // e.g., "NONE", "FIRST_QUARTILE"
            date: string;
          }>;
        }>;
      };
    };
  };
}
