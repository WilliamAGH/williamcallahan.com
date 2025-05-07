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
  level: 0 | 1 | 2 | 3 | 4;
}

/**
 * Represents the structure of the response from the
 * `/api/github-activity` endpoint.
 */
export interface GitHubActivityApiResponse {
  source: 'scraping' | 'api' | 'api_multi_file_cache'; // Added 'api_multi_file_cache'
  data: ContributionDay[];
  totalContributions: number; // Ensure this is always present
  linesAdded?: number; // Total lines of code added in the last 365 days
  linesRemoved?: number; // Total lines of code removed in the last 365 days
  dataComplete?: boolean; // Indicates if all repositories' stats were successfully retrieved
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
    repositoriesContributedTo?: {
      nodes: Array<{
        id: string;
        name: string;
        owner: {
          login: string;
        };
        nameWithOwner: string;
        isFork: boolean;
        isPrivate: boolean;
      }>;
    };
  };
}

/**
 * Represents the cache structure for repository weekly statistics.
 */
export interface RepoWeeklyStatCache {
  repoOwnerLogin: string;
  repoName: string;
  lastFetched: string; // ISO string
  status: 'complete' | 'pending_202_from_api' | 'fetch_error' | 'empty_no_user_contribs';
  stats: RepoRawWeeklyStat[];
}

/**
 * Represents raw weekly statistics for a repository.
 */
export interface RepoRawWeeklyStat {
  w: number; // week timestamp (seconds since epoch)
  a: number; // additions
  d: number; // deletions
  c: number; // commits
}

/**
 * Represents aggregated weekly activity data.
 */
export interface AggregatedWeeklyActivity {
  weekStartDate: string; // YYYY-MM-DD
  linesAdded: number;
  linesRemoved: number;
}

/**
 * Represents the author of a commit/contribution, typically part of a contributor stats entry.
 */
export interface GithubAuthor {
  login: string;
  // Add other author fields if available/needed (e.g., id, avatar_url)
}

/**
 * Represents an entry for a single contributor's weekly statistics from the GitHub API.
 */
export interface GithubContributorStatsEntry {
  author: GithubAuthor;
  weeks: RepoRawWeeklyStat[];
  total?: number; // Total commits for this contributor in this repo
  // Add other fields if available/needed
}
