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
 * Raw GitHub activity shape returned by getGithubActivity (flat structure)
 */
export interface RawGitHubActivityApiResponse {
  source: 'scraping' | 'api' | 'api_multi_file_cache';
  data: ContributionDay[];
  totalContributions: number;
  linesAdded?: number;
  linesRemoved?: number;
  dataComplete?: boolean;
  error?: string;
  details?: string;
}

/**
 * Represents a segment of GitHub activity data with optional summary
 */
export interface GitHubActivitySegment extends RawGitHubActivityApiResponse {
  /** Summary activity for this period */
  summaryActivity?: GitHubActivitySummary;
}

/**
 * Response from `/api/github-activity` with nested segments
 */
export interface GitHubActivityApiResponse {
  /** Daily contributions over the last 365 days */
  trailingYearData: GitHubActivitySegment;
  /** Cumulative all-time contribution data */
  cumulativeAllTimeData: GitHubActivitySegment;
  /** Error message if fetching failed */
  error?: string;
  /** Additional error details */
  details?: string;
}

/**
 * Structure of the GitHub activity summary JSON file stored in S3
 */
export interface GitHubActivitySummary {
  lastUpdatedAtPacific: string;
  totalContributions: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  netLinesOfCode: number;
  dataComplete: boolean;
  totalRepositoriesContributedTo: number;
  linesOfCodeByCategory: {
    frontend: { linesAdded: number; linesRemoved: number; netChange: number; repoCount: number };
    backend: { linesAdded: number; linesRemoved: number; netChange: number; repoCount: number };
    dataEngineer: { linesAdded: number; linesRemoved: number; netChange: number; repoCount: number };
    other: { linesAdded: number; linesRemoved: number; netChange: number; repoCount: number };
  };
}

/**
 * Represents the raw structure of the response from the
 * GitHub GraphQL API for contribution calendar data.
 */
export interface GitHubGraphQLContributionResponse {
  user: {
    /** Repositories the user has committed to */
    repositoriesContributedTo: {
      nodes: Array<{
        id: string;
        name: string;
        owner: { login: string };
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
