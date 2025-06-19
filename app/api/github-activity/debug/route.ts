/**
 * Debug endpoint for GitHub activity data
 *
 * This endpoint provides diagnostic information about the GitHub activity system
 * without triggering any data refreshes or modifications.
 */

import {
  GITHUB_ACTIVITY_S3_KEY_FILE,
  GITHUB_ACTIVITY_S3_KEY_FILE_FALLBACK,
  GITHUB_STATS_SUMMARY_S3_KEY_FILE,
  ALL_TIME_SUMMARY_S3_KEY_FILE,
  REPO_RAW_WEEKLY_STATS_S3_KEY_DIR,
  AGGREGATED_WEEKLY_ACTIVITY_S3_KEY_FILE,
} from "@/lib/data-access/github";
import { getS3ObjectMetadata, listS3Objects } from "@/lib/s3-utils";
import { ServerCacheInstance } from "@/lib/server-cache";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  // CRITICAL: Never allow debug endpoint in production
  // This prevents accidental exposure via misconfigured GITHUB_DEBUG env var
  const isProduction = process.env.NODE_ENV === "production";
  const isDevelopment = process.env.NODE_ENV === "development";
  const debugEnabled = isDevelopment && process.env.GITHUB_DEBUG !== "false";

  if (isProduction || !debugEnabled) {
    return NextResponse.json({ message: "Debug endpoint is disabled" }, { status: 403 });
  }

  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV || "not set",
      // Only show whether tokens are configured, not their values or operational details
      GITHUB_ACCESS_TOKEN_SET: !!process.env.GITHUB_ACCESS_TOKEN_COMMIT_GRAPH,
      GITHUB_REFRESH_SECRET_SET: !!process.env.GITHUB_REFRESH_SECRET,
      // Omit sensitive operational details like bucket names and repo owners
      // These can be inferred by attackers for targeted attacks
    },
    // Only show that S3 keys are configured without revealing paths
    s3KeysConfigured: {
      activityFile: !!GITHUB_ACTIVITY_S3_KEY_FILE,
      fallbackFile: !!GITHUB_ACTIVITY_S3_KEY_FILE_FALLBACK,
      summaryFile: !!GITHUB_STATS_SUMMARY_S3_KEY_FILE,
      allTimeSummaryFile: !!ALL_TIME_SUMMARY_S3_KEY_FILE,
      weeklyStatsDir: !!REPO_RAW_WEEKLY_STATS_S3_KEY_DIR,
      aggregatedWeeklyFile: !!AGGREGATED_WEEKLY_ACTIVITY_S3_KEY_FILE,
    },
    cache: {
      hasGitHubActivity: !!ServerCacheInstance.get("githubActivity"),
      stats: ServerCacheInstance.getStats(),
    },
    s3Status: {} as Record<string, unknown>,
  };

  try {
    // Check main activity file
    const mainMeta = await getS3ObjectMetadata(GITHUB_ACTIVITY_S3_KEY_FILE);
    diagnostics.s3Status = {
      ...(diagnostics.s3Status as Record<string, unknown>),
      mainFile: {
        exists: !!mainMeta,
        lastModified: mainMeta?.LastModified?.toISOString(),
        size: undefined,
      },
    };

    // Check fallback file
    const fallbackMeta = await getS3ObjectMetadata(GITHUB_ACTIVITY_S3_KEY_FILE_FALLBACK);
    diagnostics.s3Status = {
      ...(diagnostics.s3Status as Record<string, unknown>),
      fallbackFile: {
        exists: !!fallbackMeta,
        lastModified: fallbackMeta?.LastModified?.toISOString(),
        size: undefined,
      },
    };

    // List weekly stats files with pagination limit to avoid S3 performance issues
    try {
      // Limit to first 10 files to prevent excessive S3 API calls
      const maxKeys = 10;
      const weeklyFiles = await listS3Objects(REPO_RAW_WEEKLY_STATS_S3_KEY_DIR);
      const limitedFiles = weeklyFiles.slice(0, maxKeys);

      diagnostics.s3Status = {
        ...(diagnostics.s3Status as Record<string, unknown>),
        weeklyStatsCount: limitedFiles.length,
        sampleWeeklyFiles: limitedFiles.slice(0, 5),
        note: `Showing first ${maxKeys} files only to prevent performance impact`,
      };
    } catch (err) {
      diagnostics.s3Status = {
        ...(diagnostics.s3Status as Record<string, unknown>),
        weeklyStatsError: err instanceof Error ? err.message : "Unknown error",
      };
    }
  } catch (error) {
    diagnostics.s3Error = error instanceof Error ? error.message : "Unknown error";
  }

  // Add scheduler info
  diagnostics.scheduler = {
    expectedCron: "0 0 * * * (daily at midnight PT)",
    note: "Check container/process logs for scheduler status",
  };

  return NextResponse.json(diagnostics, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
