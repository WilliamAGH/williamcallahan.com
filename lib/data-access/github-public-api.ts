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
import { getEnvironment } from "@/lib/config/environment";
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

  // Enhanced fallback mechanism: Try production file for ANY environment when primary is missing
  // This ensures data is always available, even during initial deployments
  const isEmptyData = (data: unknown): boolean => {
    if (!data || typeof data !== "object") return true;
    const obj = data as { trailingYearData?: { data?: unknown[]; totalContributions?: number } };
    const ty = obj.trailingYearData;
    if (!ty) return true;

    // Don't treat zero contributions as "empty" - users can legitimately have 0 contributions
    const hasSeries = Array.isArray(ty.data) && ty.data.length > 0;
    const hasCount = typeof ty.totalContributions === "number" && Number.isFinite(ty.totalContributions);

    // Empty only if we have neither series data nor a known count
    return !hasSeries && !hasCount;
  };

  // Try fallback for ANY environment if primary data is missing or empty
  if (!s3ActivityData || isEmptyData(s3ActivityData)) {
    const { envLogger } = await import("@/lib/utils/env-logger");
    const currentEnv = getEnvironment();

    // Always try the production fallback file
    const fallbackKey = GITHUB_ACTIVITY_S3_KEY_FILE_FALLBACK;
    envLogger.log(
      `Primary data missing/empty for ${currentEnv}, attempting production fallback`,
      { primaryKey: GITHUB_ACTIVITY_S3_KEY_FILE, fallbackKey },
      { category: "GitHubActivity" },
    );

    const fallbackData = await readGitHubActivityFromS3(fallbackKey);

    // Use fallback if it has valid data
    if (fallbackData && !isEmptyData(fallbackData)) {
      s3ActivityData = fallbackData;
      metadataKey = fallbackKey;
      envLogger.log(
        `Successfully using production fallback data`,
        { environment: currentEnv, fallbackKey },
        { category: "GitHubActivity" },
      );
    } else {
      // If we're in production and both files are missing, try WITHOUT suffix
      // This handles the case where files might be stored without environment suffix
      if (currentEnv === "production" && GITHUB_ACTIVITY_S3_KEY_FILE.includes(".json")) {
        const baseKey = GITHUB_ACTIVITY_S3_KEY_FILE.replace(
          /(-dev|-test)?\.json$/,
          ".json",
        ) as `json/github-activity/activity_data${string}.json`;
        if (baseKey !== GITHUB_ACTIVITY_S3_KEY_FILE) {
          const baseData = await readGitHubActivityFromS3(baseKey);
          if (baseData && !isEmptyData(baseData)) {
            s3ActivityData = baseData;
            metadataKey = baseKey;
            envLogger.log(
              `Using base filename without environment suffix`,
              { baseKey },
              { category: "GitHubActivity" },
            );
          }
        }
      }
    }

    // Log critical error if still no data
    if (!s3ActivityData || isEmptyData(s3ActivityData)) {
      envLogger.log(
        `CRITICAL: No usable GitHub data found in any location`,
        {
          primaryKey: GITHUB_ACTIVITY_S3_KEY_FILE,
          fallbackKey: GITHUB_ACTIVITY_S3_KEY_FILE_FALLBACK,
          environment: currentEnv,
        },
        { category: "GitHubActivity" },
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
