/**
 * GitHub Public API Module
 *
 * High-level functions for fetching GitHub activity data from PostgreSQL.
 * Provides the main public interface with caching support.
 *
 * @module data-access/github-public-api
 */

import { debug } from "@/lib/utils/debug";
import { cacheContextGuards, USE_NEXTJS_CACHE, withCacheFallback } from "@/lib/cache";
import { GITHUB_CACHE_TAGS } from "@/lib/cache/invalidation";
import {
  createUnavailableUserActivityView,
  publicPriorYearCommitSummarySchema,
  type GitHubActivityApiResponse,
  type UserActivityView,
} from "@/types/schemas/github-storage";
import { readGitHubActivityRecord, getGitHubActivityMetadata } from "./github-storage";

/**
 * Formats GitHub activity data into a user-friendly view
 */
function formatActivityView(
  activityRecord: GitHubActivityApiResponse | null,
  lastRefreshed?: string,
): UserActivityView {
  if (!activityRecord) {
    return createUnavailableUserActivityView({ source: "empty" });
  }

  const { trailingYearData, cumulativeAllTimeData } = activityRecord;
  const storedPriorYearCommits = cumulativeAllTimeData.allPriorYearCommits;
  const priorYearCommits = storedPriorYearCommits
    ? publicPriorYearCommitSummarySchema.parse(storedPriorYearCommits)
    : undefined;

  return {
    source: "db-store",
    error: activityRecord.error,
    trailingYearData: {
      data: trailingYearData.data,
      totalContributions: trailingYearData.totalContributions,
      linesAdded: trailingYearData.linesAdded,
      linesRemoved: trailingYearData.linesRemoved,
      dataComplete: trailingYearData.dataComplete,
    },
    allTimeStats: {
      totalContributions: cumulativeAllTimeData.totalContributions,
      linesAdded: cumulativeAllTimeData.linesAdded,
      linesRemoved: cumulativeAllTimeData.linesRemoved,
    },
    priorYearCommits,
    lastRefreshed,
  };
}

/**
 * Primary function to get GitHub activity data from the database.
 * All GitHub activity is stored in a single PostgreSQL row; no object-key
 * fallback logic is needed.
 */
export async function getGithubActivity(): Promise<UserActivityView> {
  debug("[DataAccess/GitHub:getGithubActivity] Starting GitHub activity fetch");

  const activityData = await readGitHubActivityRecord();

  if (!activityData) {
    debug("[DataAccess/GitHub:getGithubActivity] No GitHub data found in database");
    return formatActivityView(null);
  }

  const metadata = await getGitHubActivityMetadata();
  const lastRefreshed = metadata?.lastModified?.toISOString();

  return formatActivityView(activityData, lastRefreshed);
}

/**
 * Direct access to GitHub activity without Next.js caching layers
 */
async function getGithubActivityDirect(): Promise<UserActivityView> {
  return getGithubActivity();
}

/**
 * Cached wrapper using Next.js unstable_cache
 */
async function getCachedGithubActivity(): Promise<UserActivityView> {
  "use cache";
  cacheContextGuards.cacheLife("GitHubActivity", "minutes");
  cacheContextGuards.cacheTag(
    GITHUB_CACHE_TAGS.CATEGORY,
    GITHUB_CACHE_TAGS.PRIMARY,
    GITHUB_CACHE_TAGS.MAIN,
  );

  return getGithubActivityDirect();
}

/**
 * Get GitHub activity with Next.js caching support
 */
export async function getGithubActivityCached(): Promise<UserActivityView> {
  if (!USE_NEXTJS_CACHE) {
    return getGithubActivityDirect();
  }

  return withCacheFallback(getCachedGithubActivity, getGithubActivityDirect);
}
