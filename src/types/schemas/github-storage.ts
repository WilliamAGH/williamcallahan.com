/**
 * GitHub S3 Storage Schemas
 * @module types/schemas/github-storage
 * @description
 * Zod v4 schemas for GitHub activity data persisted in S3.
 */

import { z } from "zod/v4";

export const contributionDaySchema = z.object({
  date: z.string(),
  count: z.number(),
  level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});

export type ContributionDayFromSchema = z.infer<typeof contributionDaySchema>;

export const commitsOlderThanYearRepoStatsSchema = z.object({
  commits: z.number(),
  linesAdded: z.number(),
  linesRemoved: z.number(),
  isPrivate: z.boolean(),
});

export type CommitsOlderThanYearRepoStatsFromSchema = z.infer<
  typeof commitsOlderThanYearRepoStatsSchema
>;

export const commitsOlderThanYearSummarySchema = z.object({
  totalCommits: z.number(),
  totalLinesAdded: z.number(),
  totalLinesRemoved: z.number(),
  publicCommits: z.number(),
  privateCommits: z.number(),
  perRepo: z.record(z.string(), commitsOlderThanYearRepoStatsSchema),
});

export type CommitsOlderThanYearSummaryFromSchema = z.infer<
  typeof commitsOlderThanYearSummarySchema
>;

export const githubActivitySegmentSchema = z.object({
  source: z.enum(["scraping", "api", "api_multi_file_cache"]),
  data: z.array(contributionDaySchema),
  totalContributions: z.number(),
  linesAdded: z.number().optional(),
  linesRemoved: z.number().optional(),
  dataComplete: z.boolean().optional(),
  error: z.string().optional(),
  details: z.string().optional(),
  allCommitsOlderThanYear: commitsOlderThanYearSummarySchema.optional(),
});

export type GitHubActivitySegmentFromSchema = z.infer<typeof githubActivitySegmentSchema>;

export const gitHubActivityApiResponseSchema = z.object({
  trailingYearData: githubActivitySegmentSchema,
  cumulativeAllTimeData: githubActivitySegmentSchema,
  error: z.string().optional(),
  details: z.string().optional(),
});

export type GitHubActivityApiResponseFromSchema = z.infer<typeof gitHubActivityApiResponseSchema>;

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

export type GitHubActivitySummaryFromSchema = z.infer<typeof gitHubActivitySummarySchema>;

export const repoRawWeeklyStatSchema = z.object({
  w: z.number(),
  a: z.number(),
  d: z.number(),
  c: z.number(),
});

export type RepoRawWeeklyStatFromSchema = z.infer<typeof repoRawWeeklyStatSchema>;

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

export type RepoWeeklyStatCacheFromSchema = z.infer<typeof repoWeeklyStatCacheSchema>;

export const aggregatedWeeklyActivitySchema = z.object({
  weekStartDate: z.string(),
  linesAdded: z.number(),
  linesRemoved: z.number(),
});

export type AggregatedWeeklyActivityFromSchema = z.infer<typeof aggregatedWeeklyActivitySchema>;

export const aggregatedWeeklyActivityArraySchema = z.array(aggregatedWeeklyActivitySchema);
