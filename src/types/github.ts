import { z } from "zod";
import type { ExtendedError } from "./error";

/**
 * GitHub Activity Types
 *
 * Type definitions for fetching and displaying GitHub contribution data.
 */

/**
 * Represents a single day of contribution activity.
 */
// Zod schemas for runtime validation - Single source of truth pattern
export const ContributionDaySchema = z.object({
  date: z.string(),
  count: z.number(),
  level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});

// Infer type from schema (Zod v4 best practice)
export type ContributionDay = z.infer<typeof ContributionDaySchema>;

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
  allCommitsOlderThanYear?: CommitsOlderThanYearSummary;
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
 * Per-repository stats for commits older than one trailing year window
 */
export interface CommitsOlderThanYearRepoStats {
  commits: number;
  linesAdded: number;
  linesRemoved: number;
  isPrivate: boolean;
}

/**
 * Aggregated commit statistics for activity that occurred more than one year ago
 */
export interface CommitsOlderThanYearSummary {
  totalCommits: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  publicCommits: number;
  privateCommits: number;
  perRepo: Record<string, CommitsOlderThanYearRepoStats>;
}

/**
 * Schema for GitHub GraphQL repository node
 */
export const GraphQLRepoNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  owner: z.object({
    login: z.string(),
  }),
  nameWithOwner: z.string(),
  isFork: z.boolean(),
  isPrivate: z.boolean(),
});

export type GraphQLRepoNode = z.infer<typeof GraphQLRepoNodeSchema>;

/**
 * Schema for GitHub GraphQL contribution response
 */
export const GitHubGraphQLContributionResponseSchema = z.object({
  user: z
    .object({
      id: z.string().optional(), // User's Node ID
      repositoriesContributedTo: z.object({
        nodes: z.array(GraphQLRepoNodeSchema),
      }),
    })
    .nullable(),
});

export type GitHubGraphQLContributionResponse = z.infer<
  typeof GitHubGraphQLContributionResponseSchema
>;

/** Represents a single repository node from the GraphQL contribution response. */
export type GithubRepoNode = GraphQLRepoNode;

// Schema for GraphQL commit history response
export const GraphQLCommitHistoryResponseSchema = z.object({
  repository: z
    .object({
      object: z
        .object({
          history: z
            .object({
              totalCount: z.number(),
            })
            .optional(),
        })
        .nullable(),
    })
    .nullable(),
});

export type GraphQLCommitHistoryResponse = z.infer<typeof GraphQLCommitHistoryResponseSchema>;

// Schema for REST API commit response
export const CommitSchema = z.object({
  sha: z.string(),
  commit: z
    .object({
      author: z.object({
        name: z.string(),
        email: z.string(),
        date: z.string(),
      }),
      message: z.string(),
    })
    .optional(),
});

export const CommitResponseSchema = z.array(CommitSchema);
export type CommitResponse = z.infer<typeof CommitResponseSchema>;

/**
 * Represents the cache structure for repository weekly statistics.
 */
export interface RepoWeeklyStatCache {
  repoOwnerLogin: string;
  repoName: string;
  lastFetched: string; // ISO string
  status:
    | "complete"
    | "pending_202_from_api"
    | "pending_rate_limit"
    | "fetch_error"
    | "empty_no_user_contribs";
  stats: RepoRawWeeklyStat[];
}

/**
 * Schema for raw weekly statistics for a repository
 */
export const RepoRawWeeklyStatSchema = z.object({
  w: z.number(), // week timestamp (seconds since epoch)
  a: z.number(), // additions
  d: z.number(), // deletions
  c: z.number(), // commits
});

export type RepoRawWeeklyStat = z.infer<typeof RepoRawWeeklyStatSchema>;

/**
 * Represents aggregated weekly activity data.
 */
export interface AggregatedWeeklyActivity {
  weekStartDate: string; // YYYY-MM-DD
  linesAdded: number;
  linesRemoved: number;
}

/**
 * Schema for GitHub author
 */
export const GithubAuthorSchema = z.object({
  login: z.string(),
  id: z.number().optional(),
  avatar_url: z.string().optional(),
});

export type GithubAuthor = z.infer<typeof GithubAuthorSchema>;

/**
 * Schema for contributor stats entry from GitHub API
 */
export const GithubContributorStatsEntrySchema = z.object({
  author: GithubAuthorSchema,
  weeks: z.array(RepoRawWeeklyStatSchema),
  total: z.number().optional(), // Total commits for this contributor in this repo
});

export type GithubContributorStatsEntry = z.infer<typeof GithubContributorStatsEntrySchema>;

// Schema for the full contributor stats API response
export const ContributorStatsResponseSchema = z.array(GithubContributorStatsEntrySchema);

/**
 * Represents the structured view of user GitHub activity, returned by functions like getGithubActivity.
 * This is what components and scripts like populate-volumes.ts will consume.
 */
export interface UserActivityView {
  source: "s3-store" | "s3-store-fallback" | "api-fallback" | "error" | "empty";
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
  commitsOlderThanYear?: CommitsOlderThanYearSummary;
  lastRefreshed?: string;
}

// --- START: GitHub GraphQL Contribution Calendar Schemas ---
export const GraphQLContributionDaySchema = z.object({
  contributionCount: z.number(),
  contributionLevel: z.enum([
    "NONE",
    "FIRST_QUARTILE",
    "SECOND_QUARTILE",
    "THIRD_QUARTILE",
    "FOURTH_QUARTILE",
  ]),
  date: z.string(), // YYYY-MM-DD
});

export type GraphQLContributionDay = z.infer<typeof GraphQLContributionDaySchema>;

export const GraphQLContributionWeekSchema = z.object({
  contributionDays: z.array(GraphQLContributionDaySchema),
});

export type GraphQLContributionWeek = z.infer<typeof GraphQLContributionWeekSchema>;

export const GraphQLContributionCalendarSchema = z.object({
  totalContributions: z.number(),
  weeks: z.array(GraphQLContributionWeekSchema),
});

export type GraphQLContributionCalendar = z.infer<typeof GraphQLContributionCalendarSchema>;

export const GraphQLContributionsCollectionSchema = z.object({
  contributionCalendar: GraphQLContributionCalendarSchema,
});

export type GraphQLContributionsCollection = z.infer<typeof GraphQLContributionsCollectionSchema>;

export const GraphQLUserContributionsResponseSchema = z.object({
  user: z
    .object({
      contributionsCollection: GraphQLContributionsCollectionSchema,
    })
    .nullable(),
});

export type GraphQLUserContributionsResponse = z.infer<
  typeof GraphQLUserContributionsResponseSchema
>;
// --- END: GitHub GraphQL Contribution Calendar Schemas ---

/**
 * Error interface for GitHub activity fetch errors
 */
export interface GitHubActivityError extends ExtendedError {
  /** Timestamp of when activity was last successfully fetched */
  lastFetched?: number;
  /** Timestamp of the last fetch attempt */
  lastFetchedTimestamp?: number;
}
