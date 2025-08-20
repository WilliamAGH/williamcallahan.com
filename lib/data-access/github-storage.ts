/**
 * GitHub S3 Storage Module
 *
 * Handles all S3 storage operations for GitHub activity data
 * Includes caching, CSV repair, and data persistence
 *
 * @module data-access/github-storage
 */

import { readJsonS3, writeJsonS3, listS3Objects as s3UtilsListS3Objects, getS3ObjectMetadata } from "@/lib/s3-utils";

import { debugLog } from "@/lib/utils/debug";
import {
  GITHUB_ACTIVITY_S3_KEY_DIR,
  GITHUB_ACTIVITY_S3_KEY_FILE,
  GITHUB_ACTIVITY_S3_KEY_FILE_FALLBACK,
  GITHUB_STATS_SUMMARY_S3_KEY_FILE,
  ALL_TIME_SUMMARY_S3_KEY_FILE,
  REPO_RAW_WEEKLY_STATS_S3_KEY_DIR,
  AGGREGATED_WEEKLY_ACTIVITY_S3_KEY_FILE,
} from "@/lib/constants";
import type {
  StoredGithubActivityS3,
  GitHubActivityApiResponse,
  GitHubActivitySummary,
  RepoWeeklyStatCache,
  AggregatedWeeklyActivity,
} from "@/types/github";

// Re-export S3 paths for backward compatibility
export {
  GITHUB_ACTIVITY_S3_KEY_DIR,
  GITHUB_ACTIVITY_S3_KEY_FILE,
  GITHUB_ACTIVITY_S3_KEY_FILE_FALLBACK,
  GITHUB_STATS_SUMMARY_S3_KEY_FILE,
  ALL_TIME_SUMMARY_S3_KEY_FILE,
  REPO_RAW_WEEKLY_STATS_S3_KEY_DIR,
  AGGREGATED_WEEKLY_ACTIVITY_S3_KEY_FILE,
};

/**
 * Read GitHub activity data from S3
 */
export async function readGitHubActivityFromS3(
  key: string = GITHUB_ACTIVITY_S3_KEY_FILE,
): Promise<GitHubActivityApiResponse | null> {
  try {
    const data = await readJsonS3<GitHubActivityApiResponse>(key);
    if (!data) {
      debugLog(`No GitHub activity data found at ${key}`, "warn");
      return null;
    }
    return data;
  } catch (error) {
    debugLog(`Failed to read GitHub activity from S3`, "error", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Write GitHub activity data to S3
 */
export async function writeGitHubActivityToS3(
  data: GitHubActivityApiResponse,
  key: string = GITHUB_ACTIVITY_S3_KEY_FILE,
): Promise<boolean> {
  try {
    // 1) Never write during Next.js build phase – build reads from public CDN only
    if (process.env.NEXT_PHASE === "phase-production-build") {
      debugLog(
        `Skipping GitHub activity write during build phase (NEXT_PHASE=phase-production-build)`,
        "warn",
        { key },
      );
      return true; // treat as successful no-op
    }

    // 2) Non-degrading write: avoid overwriting a healthy dataset with empty/incomplete results
    // BUT be more lenient - allow writes if data has meaningful content even if not "complete"
    
    // Classify dataset quality to support non-degrading writes
    const classifyDataset = (d: GitHubActivityApiResponse | null | undefined) => {
      if (!d) {
        return {
          hasData: false,
          hasCount: false,
          contributions: -1,
          isEmpty: true,
          isIncomplete: true,
        };
      }
      
      const ty = d.trailingYearData as { data?: unknown[]; dataComplete?: boolean; totalContributions?: number } | undefined;
      const hasData = Array.isArray(ty?.data) && (ty?.data?.length ?? 0) > 0;
      // Treat 0 as a valid known count (don't penalize quiet/new accounts)
      const hasCount = typeof ty?.totalContributions === "number" && Number.isFinite(ty.totalContributions);
      const contributions = hasCount ? (ty.totalContributions ?? -1) : -1;
      
      return {
        hasData,
        hasCount,
        contributions,
        isEmpty: !hasData && !hasCount,
        // Incomplete = missing daily series (even if we know the count)
        isIncomplete: !hasData,
      };
    };

    // If new data looks incomplete (no daily series), check existing
    const newQ = classifyDataset(data);
    if (newQ.isIncomplete) {
      try {
        const existing = await readGitHubActivityFromS3(key);
        const existingQ = classifyDataset(existing);
        const existingIsHealthy = !!existing && !existingQ.isEmpty;
        
        // Only skip write if existing data is actually better
        if (existingIsHealthy) {
          const existingContributions = Math.max(0, existingQ.contributions);
          const newContributions = Math.max(0, newQ.contributions);
          
          // Allow write if new data has MORE contributions (even if incomplete / no series)
          if (newContributions > existingContributions) {
            debugLog(
              `Writing new data despite incomplete flag - has more contributions`,
              "info",
              { key, oldCount: existingContributions, newCount: newContributions },
            );
          } else {
            debugLog(
              `Non-degrading write: Preserving existing dataset with more data`,
              "warn",
              { key, existingCount: existingContributions, newCount: newContributions },
            );
            return true; // skip write, keep healthy file
          }
        }
      } catch {
        /* if read fails, proceed to write new data */
      }
    }

    await writeJsonS3(key, data);
    debugLog(`Successfully wrote GitHub activity to S3`, "info", { key });
    return true;
  } catch (error) {
    debugLog(`Failed to write GitHub activity to S3`, "error", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Read GitHub activity summary from S3
 */
export async function readGitHubSummaryFromS3(): Promise<GitHubActivitySummary | null> {
  try {
    return await readJsonS3<GitHubActivitySummary>(GITHUB_STATS_SUMMARY_S3_KEY_FILE);
  } catch (error) {
    debugLog(`Failed to read GitHub summary from S3`, "error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Write GitHub activity summary to S3
 */
export async function writeGitHubSummaryToS3(summary: GitHubActivitySummary): Promise<boolean> {
  try {
    await writeJsonS3(GITHUB_STATS_SUMMARY_S3_KEY_FILE, summary);
    debugLog(`Successfully wrote GitHub summary to S3`, "info");
    return true;
  } catch (error) {
    debugLog(`Failed to write GitHub summary to S3`, "error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Read repository weekly stats cache from S3
 */
export async function readRepoWeeklyStatsFromS3(
  repoOwner: string,
  repoName: string,
): Promise<RepoWeeklyStatCache | null> {
  const s3Key = `${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}/${repoOwner}/${repoName}.json`;
  try {
    return await readJsonS3<RepoWeeklyStatCache>(s3Key);
  } catch (error) {
    debugLog(`Failed to read repo weekly stats from S3`, "error", {
      s3Key,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Write repository weekly stats cache to S3
 */
export async function writeRepoWeeklyStatsToS3(
  repoOwner: string,
  repoName: string,
  cache: RepoWeeklyStatCache,
): Promise<boolean> {
  const s3Key = `${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}/${repoOwner}/${repoName}.json`;
  try {
    await writeJsonS3(s3Key, cache);
    debugLog(`Successfully wrote repo weekly stats to S3`, "info", { s3Key });
    return true;
  } catch (error) {
    debugLog(`Failed to write repo weekly stats to S3`, "error", {
      s3Key,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Read aggregated weekly activity from S3
 */
export async function readAggregatedWeeklyActivityFromS3(): Promise<AggregatedWeeklyActivity[] | null> {
  try {
    return await readJsonS3<AggregatedWeeklyActivity[]>(AGGREGATED_WEEKLY_ACTIVITY_S3_KEY_FILE);
  } catch (error) {
    debugLog(`Failed to read aggregated weekly activity from S3`, "error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Write aggregated weekly activity to S3
 */
export async function writeAggregatedWeeklyActivityToS3(data: AggregatedWeeklyActivity[]): Promise<boolean> {
  try {
    await writeJsonS3(AGGREGATED_WEEKLY_ACTIVITY_S3_KEY_FILE, data);
    debugLog(`Successfully wrote aggregated weekly activity to S3`, "info");
    return true;
  } catch (error) {
    debugLog(`Failed to write aggregated weekly activity to S3`, "error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * List all repository stats files in S3
 */
export async function listRepoStatsFiles(): Promise<string[]> {
  try {
    const results = await s3UtilsListS3Objects(REPO_RAW_WEEKLY_STATS_S3_KEY_DIR);
    return results.filter((key) => key.endsWith(".json")).sort();
  } catch (error) {
    debugLog(`Failed to list repo stats files`, "error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Get metadata for GitHub activity file
 */
export async function getGitHubActivityMetadata(key: string = GITHUB_ACTIVITY_S3_KEY_FILE): Promise<{
  lastModified?: Date;
} | null> {
  try {
    const metadata = await getS3ObjectMetadata(key);
    return metadata
      ? {
          lastModified: metadata.LastModified,
        }
      : null;
  } catch (error) {
    debugLog(`Failed to get GitHub activity metadata`, "error", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Check if old format stored GitHub activity
 */
export function isOldFlatStoredGithubActivityS3Format(obj: unknown): obj is StoredGithubActivityS3 {
  if (!obj || typeof obj !== "object") return false;
  const activity = obj as Record<string, unknown>;

  return (
    typeof activity.source === "string" &&
    Array.isArray(activity.data) &&
    typeof activity.totalContributions === "number"
  );
}
