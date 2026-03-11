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
import { formatPacificDateTime } from "@/lib/utils/date-format";
import type {
  GitHubActivityApiResponse,
  StoredGithubActivity,
  UserActivityView,
} from "@/types/github";
import {
  readGitHubActivityRecord,
  isFlatStoredGithubActivityFormat,
  getGitHubActivityMetadata,
} from "./github-storage";

/**
 * Checks if GitHub activity data is empty or invalid
 */
function isEmptyData(data: unknown): boolean {
  if (!data || typeof data !== "object") return true;
  const obj = data as { trailingYearData?: { data?: unknown[]; totalContributions?: number } };
  const ty = obj.trailingYearData;
  if (!ty) return true;

  // Don't treat zero contributions as "empty" - users can legitimately have 0 contributions
  const hasSeries = Array.isArray(ty.data) && ty.data.length > 0;
  const hasCount =
    typeof ty.totalContributions === "number" && Number.isFinite(ty.totalContributions);

  // Empty only if we have neither series data nor a known count
  return !hasSeries && !hasCount;
}

/**
 * Formats GitHub activity data into a user-friendly view
 */
function formatActivityView(
  activityRecord: GitHubActivityApiResponse | null,
  source: UserActivityView["source"],
  lastRefreshed?: string,
): UserActivityView {
  if (!activityRecord) {
    return {
      source: "empty",
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
    };
  }

  const trailingYearData = activityRecord.trailingYearData || {
    data: [],
    totalContributions: 0,
    linesAdded: 0,
    linesRemoved: 0,
    dataComplete: false,
  };

  const allTimeData = activityRecord.cumulativeAllTimeData || trailingYearData;
  const priorYearCommits = allTimeData.allPriorYearCommits;

  return {
    source,
    error: activityRecord.error,
    trailingYearData: {
      data: trailingYearData.data || [],
      totalContributions: trailingYearData.totalContributions || 0,
      linesAdded: trailingYearData.linesAdded || 0,
      linesRemoved: trailingYearData.linesRemoved || 0,
      dataComplete: trailingYearData.dataComplete ?? false,
    },
    allTimeStats: {
      totalContributions: allTimeData.totalContributions || 0,
      linesAdded: allTimeData.linesAdded || 0,
      linesRemoved: allTimeData.linesRemoved || 0,
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

  let activityData = await readGitHubActivityRecord();

  if (!activityData || isEmptyData(activityData)) {
    debug("[DataAccess/GitHub:getGithubActivity] No GitHub data found in database");
    return formatActivityView(null, "error");
  }

  const metadata = await getGitHubActivityMetadata();
  const lastRefreshed = metadata?.lastModified
    ? formatPacificDateTime(metadata.lastModified)
    : undefined;

  // Handle old flat format (backward compatibility)
  if (isFlatStoredGithubActivityFormat(activityData)) {
    debug("[DataAccess/GitHub:getGithubActivity] Converting old flat format to new nested format");
    const oldFormatData = activityData as StoredGithubActivity;
    activityData = {
      trailingYearData: oldFormatData,
      cumulativeAllTimeData: oldFormatData,
    };
  }

  return formatActivityView(activityData, "db-store", lastRefreshed);
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
