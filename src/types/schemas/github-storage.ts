/**
 * GitHub Activity Storage Schemas
 * @module types/schemas/github-storage
 * @description
 * Zod v4 schemas for stored GitHub activity and its public API projections.
 */

import { z } from "zod/v4";

export const githubActivityRefreshSuccessResponseSchema = z.discriminatedUnion("dataFetched", [
  z.object({
    message: z.string(),
    dataFetched: z.literal(false),
    readOnly: z.literal(true),
  }),
  z.object({
    message: z.string(),
    dataFetched: z.literal(true),
    trailingYearCommits: z.number().int().nonnegative(),
    allTimeCommits: z.number().int().nonnegative(),
  }),
]);

export type GitHubActivityRefreshSuccessResponse = z.infer<
  typeof githubActivityRefreshSuccessResponseSchema
>;

export const contributionDaySchema = z.object({
  date: z.iso.date(),
  count: z.number().int().nonnegative(),
  level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});

export type ContributionDay = z.infer<typeof contributionDaySchema>;

export const priorYearCommitRepoStatsSchema = z.object({
  commits: z.number(),
  linesAdded: z.number(),
  linesRemoved: z.number(),
  isPrivate: z.boolean(),
});

export type PriorYearCommitRepoStats = z.infer<typeof priorYearCommitRepoStatsSchema>;

export const priorYearCommitSummarySchema = z.object({
  totalCommits: z.number(),
  totalLinesAdded: z.number(),
  totalLinesRemoved: z.number(),
  publicCommits: z.number(),
  privateCommits: z.number(),
  perRepo: z.record(z.string(), priorYearCommitRepoStatsSchema),
});

export type PriorYearCommitSummary = z.infer<typeof priorYearCommitSummarySchema>;

export const publicPriorYearCommitSummarySchema = priorYearCommitSummarySchema.omit({
  perRepo: true,
});

export type PublicPriorYearCommitSummary = z.infer<typeof publicPriorYearCommitSummarySchema>;

export const githubActivitySegmentSchema = z.object({
  source: z.enum(["scraping", "api", "api_multi_file_cache"]),
  data: z.array(contributionDaySchema),
  totalContributions: z.number(),
  linesAdded: z.number().default(0),
  linesRemoved: z.number().default(0),
  dataComplete: z.boolean().default(false),
  error: z.string().optional(),
  details: z.string().optional(),
  allPriorYearCommits: priorYearCommitSummarySchema.optional(),
});

export type GitHubActivitySegment = z.infer<typeof githubActivitySegmentSchema>;

const publicTrailingYearActivitySchema = githubActivitySegmentSchema.pick({
  data: true,
  totalContributions: true,
  linesAdded: true,
  linesRemoved: true,
  dataComplete: true,
});

export const userActivityViewSchema = z.object({
  source: z.enum(["db-store", "error", "empty"]),
  error: z.string().optional(),
  trailingYearData: publicTrailingYearActivitySchema,
  allTimeStats: githubActivitySegmentSchema.pick({
    totalContributions: true,
    linesAdded: true,
    linesRemoved: true,
  }),
  priorYearCommits: publicPriorYearCommitSummarySchema.optional(),
  lastRefreshed: z.iso.datetime().optional(),
});

export type UserActivityView = z.infer<typeof userActivityViewSchema>;

export function createUnavailableUserActivityView({
  source,
  error,
}: {
  source: Extract<UserActivityView["source"], "empty" | "error">;
  error?: string;
}): UserActivityView {
  const view = {
    source,
    trailingYearData: {
      data: [],
      totalContributions: 0,
      linesAdded: 0,
      linesRemoved: 0,
      dataComplete: false,
    },
    allTimeStats: {
      totalContributions: 0,
      linesAdded: 0,
      linesRemoved: 0,
    },
  } satisfies UserActivityView;

  return error === undefined ? view : { ...view, error };
}

export const gitHubActivityApiResponseSchema = z.object({
  trailingYearData: githubActivitySegmentSchema,
  cumulativeAllTimeData: githubActivitySegmentSchema,
  error: z.string().optional(),
  details: z.string().optional(),
});

export type GitHubActivityApiResponse = z.infer<typeof gitHubActivityApiResponseSchema>;

export const GITHUB_ACTIVITY_WRITE_INTENTS = {
  PRESERVE_HEALTHY_ACTIVITY: "preserve-healthy-activity",
  REPLACE_EMPTY_CURRENT_REPOSITORY_SET: "replace-empty-current-repository-set",
} as const;

export const githubActivityWriteIntentSchema = z.enum([
  GITHUB_ACTIVITY_WRITE_INTENTS.PRESERVE_HEALTHY_ACTIVITY,
  GITHUB_ACTIVITY_WRITE_INTENTS.REPLACE_EMPTY_CURRENT_REPOSITORY_SET,
]);

export type GitHubActivityWriteIntent = z.infer<typeof githubActivityWriteIntentSchema>;

const locCategorySchema = z.object({
  linesAdded: z.number(),
  linesRemoved: z.number(),
  netChange: z.number(),
  repoCount: z.number(),
});

export const gitHubActivitySummarySchema = z.object({
  lastUpdatedAtPacific: z.string(),
  totalContributions: z.number(),
  totalLinesAdded: z.number(),
  totalLinesRemoved: z.number(),
  netLinesOfCode: z.number(),
  dataComplete: z.boolean(),
  totalRepositoriesContributedTo: z.number(),
  linesOfCodeByCategory: z.object({
    frontend: locCategorySchema,
    backend: locCategorySchema,
    dataEngineer: locCategorySchema,
    other: locCategorySchema,
  }),
});

export type GitHubActivitySummary = z.infer<typeof gitHubActivitySummarySchema>;

export const gitHubActivitySummaryDocumentsSchema = z.object({
  trailingYear: gitHubActivitySummarySchema,
  allTime: gitHubActivitySummarySchema,
});

export type GitHubActivitySummaryDocuments = z.infer<typeof gitHubActivitySummaryDocumentsSchema>;

export const repoRawWeeklyStatSchema = z.object({
  w: z.number(),
  a: z.number(),
  d: z.number(),
  c: z.number(),
});

export type RepoRawWeeklyStat = z.infer<typeof repoRawWeeklyStatSchema>;

export const repoWeeklyStatCacheSchema = z.object({
  repoOwnerLogin: z.string(),
  repoName: z.string(),
  lastFetched: z.string(),
  status: z.enum([
    "complete",
    "pending_202_from_api",
    "pending_rate_limit",
    "fetch_error",
    "empty_no_user_contribs",
  ]),
  stats: z.array(repoRawWeeklyStatSchema),
});

export type RepoWeeklyStatCache = z.infer<typeof repoWeeklyStatCacheSchema>;

export const aggregatedWeeklyActivitySchema = z.object({
  weekStartDate: z.string(),
  linesAdded: z.number(),
  linesRemoved: z.number(),
});

export type AggregatedWeeklyActivity = z.infer<typeof aggregatedWeeklyActivitySchema>;

export const aggregatedWeeklyActivityArraySchema = z.array(aggregatedWeeklyActivitySchema);
