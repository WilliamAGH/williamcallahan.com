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
 * This represents the structure of the primary GitHub activity file stored in S3.
 */
export interface StoredGithubActivityS3 {
  source: "scraping" | "api" | "api_multi_file_cache";
  data: ContributionDay[];
  totalContributions: number;
  linesAdded?: number;
  linesRemoved?: number;
  dataComplete?: boolean;
  error?: string;
  details?: string;
  allTimeTotalContributions?: number;
}

/**
 * Represents a segment of GitHub activity data with optional summary
 */
export type GitHubActivitySegment = Omit<StoredGithubActivityS3, "allTimeTotalContributions">;

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
    dataEngineer: {
      linesAdded: number;
      linesRemoved: number;
      netChange: number;
      repoCount: number;
    };
    other: { linesAdded: number; linesRemoved: number; netChange: number; repoCount: number };
  };
}

/**
 * Represents the raw structure of the response from the
 * GitHub GraphQL API for contribution calendar data.
 */
export interface GitHubGraphQLContributionResponse {
  user: {
    id?: string; // User's Node ID
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
  status: "complete" | "pending_202_from_api" | "fetch_error" | "empty_no_user_contribs";
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

/**
 * Represents the structured view of user GitHub activity, returned by functions like getGithubActivity.
 * This is what components and scripts like populate-volumes.ts will consume.
 */
export interface UserActivityView {
  source: "s3-store" | "api-fallback" | "error" | "empty";
  error?: string;
  trailingYearData: {
    data: ContributionDay[];
    totalContributions: number;
    linesAdded?: number;
    linesRemoved?: number;
    dataComplete: boolean;
  };
  allTimeStats: {
    totalContributions: number;
    linesAdded: number;
    linesRemoved: number;
  };
  lastRefreshed?: string;
}

// --- START: GitHub GraphQL Contribution Calendar Types ---
export interface GraphQLContributionDay {
  contributionCount: number;
  contributionLevel:
    | "NONE"
    | "FIRST_QUARTILE"
    | "SECOND_QUARTILE"
    | "THIRD_QUARTILE"
    | "FOURTH_QUARTILE";
  date: string; // YYYY-MM-DD
  // weekday: number; // 0-6, Sunday-Saturday - available if needed
}

export interface GraphQLContributionWeek {
  contributionDays: GraphQLContributionDay[];
}

export interface GraphQLContributionCalendar {
  totalContributions: number;
  weeks: GraphQLContributionWeek[];
}

export interface GraphQLContributionsCollection {
  contributionCalendar: GraphQLContributionCalendar;
}

export interface GraphQLUserContributionsResponse {
  user: {
    contributionsCollection: GraphQLContributionsCollection;
  };
}
// --- END: GitHub GraphQL Contribution Calendar Types ---
