/**
 * GitHub Public API Module
 *
 * High-level functions for fetching GitHub activity data
 * Provides the main public interface with caching support
 *
 * @module data-access/github-public-api
 */

import { ServerCacheInstance } from "@/lib/server-cache";
import { debug } from "@/lib/utils/debug";
import { unstable_cacheLife as cacheLife, unstable_cacheTag as cacheTag } from "next/cache";
import { USE_NEXTJS_CACHE, withCacheFallback } from "@/lib/cache";
import { formatPacificDateTime } from "@/lib/utils/date-format";
import type { GitHubActivityApiResponse, StoredGithubActivityS3, UserActivityView } from "@/types/github";
import {
  readGitHubActivityFromS3,
  isOldFlatStoredGithubActivityS3Format,
  getGitHubActivityMetadata,
  GITHUB_ACTIVITY_S3_KEY_FILE,
  GITHUB_ACTIVITY_S3_KEY_FILE_FALLBACK,
} from "./github-storage";
// Import detectAndRepairCsvFiles if needed for refreshGitHubActivityDataFromApi

/**
 * Formats GitHub activity data into a user-friendly view
 */
function formatActivityView(
  s3ActivityData: GitHubActivityApiResponse | null,
  source: UserActivityView["source"],
  lastRefreshed?: string,
): UserActivityView {
  if (!s3ActivityData) {
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

  const trailingYearData = s3ActivityData.trailingYearData || {
    data: [],
    totalContributions: 0,
    linesAdded: 0,
    linesRemoved: 0,
    dataComplete: false,
  };

  const allTimeData = s3ActivityData.cumulativeAllTimeData || trailingYearData;

  return {
    source,
    error: s3ActivityData.error,
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
    lastRefreshed,
  };
}

/**
 * Primary function to get GitHub activity data with intelligent caching
 * Access pattern: In-memory cache → S3 storage → GitHub API
 */
export async function getGithubActivity(): Promise<UserActivityView> {
  debug("[DataAccess/GitHub:getGithubActivity] Starting GitHub activity fetch");

  // Check in-memory cache first
  const cachedData = ServerCacheInstance.get<UserActivityView>("github-activity");
  if (cachedData) {
    debug("[DataAccess/GitHub:getGithubActivity] Returning GitHub activity from in-memory cache.");
    return cachedData;
  }

  debug(
    `[DataAccess/GitHub:getGithubActivity] Attempting to read GitHub activity from S3: ${GITHUB_ACTIVITY_S3_KEY_FILE}`,
  );
  let s3ActivityData = await readGitHubActivityFromS3();
  let metadataKey = GITHUB_ACTIVITY_S3_KEY_FILE;

  // Fallback: In local development or testing, the environment-specific file may not exist
  const isNonProduction = process.env.NODE_ENV !== "production" && process.env.NODE_ENV;
  if (!s3ActivityData && isNonProduction) {
    console.log(
      `[DataAccess/GitHub:getGithubActivity] Primary key not found (${GITHUB_ACTIVITY_S3_KEY_FILE}). ` +
        `NODE_ENV: '${process.env.NODE_ENV}'. ` +
        `Falling back to production key: ${GITHUB_ACTIVITY_S3_KEY_FILE_FALLBACK}`,
    );
    metadataKey = GITHUB_ACTIVITY_S3_KEY_FILE_FALLBACK;
    s3ActivityData = await readGitHubActivityFromS3(metadataKey);

    if (!s3ActivityData) {
      console.error(
        `[DataAccess/GitHub:getGithubActivity] CRITICAL: No data found in S3 for either ${GITHUB_ACTIVITY_S3_KEY_FILE} or ${GITHUB_ACTIVITY_S3_KEY_FILE_FALLBACK}. This likely means the GitHub activity data has never been successfully fetched and stored.`,
      );
    }
  }

  const s3Metadata = await getGitHubActivityMetadata(metadataKey);
  const lastRefreshed = s3Metadata?.lastModified ? formatPacificDateTime(s3Metadata.lastModified) : undefined;

  if (!s3ActivityData) {
    debug("[DataAccess/GitHub:getGithubActivity] No S3 data found. Attempting to refresh from GitHub API...");
    try {
      // TODO: Implement API refresh logic here to avoid circular dependency
      // For now, return empty data
      console.warn("[DataAccess/GitHub:getGithubActivity] API refresh not yet implemented in public API module");
      return formatActivityView(null, "error");
    } catch (error) {
      console.error(
        "[DataAccess/GitHub:getGithubActivity] Failed to refresh from API:",
        error instanceof Error ? error.message : String(error),
      );
    }

    // Return empty data if all else fails
    return formatActivityView(null, "error");
  }

  // Handle old flat format (backward compatibility)
  if (isOldFlatStoredGithubActivityS3Format(s3ActivityData)) {
    debug("[DataAccess/GitHub:getGithubActivity] Converting old flat format to new nested format");
    const oldFormatData = s3ActivityData as StoredGithubActivityS3;
    s3ActivityData = {
      trailingYearData: oldFormatData,
      cumulativeAllTimeData: oldFormatData,
    };
  }

  const formattedView = formatActivityView(s3ActivityData, "s3-store", lastRefreshed);

  // Cache the result
  ServerCacheInstance.set("github-activity", formattedView, 60 * 60 * 1000); // 1 hour

  return formattedView;
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
  cacheLife("minutes");
  cacheTag("github-activity");

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

/**
 * Invalidate GitHub cache
 */
export function invalidateGitHubCache(): void {
  ServerCacheInstance.del("github-activity");
  ServerCacheInstance.del("github-activity-summary");
  ServerCacheInstance.del("github-activity-weekly");
}

/**
 * Alias for invalidateGitHubCache
 */
export function invalidateGitHubActivityCache(): void {
  invalidateGitHubCache();
}
