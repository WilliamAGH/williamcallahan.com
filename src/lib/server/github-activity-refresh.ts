import * as Sentry from "@sentry/nextjs";
import { refreshGitHubActivityDataFromApi } from "@/lib/data-access/github";
import { resolveDatabaseAccessMode } from "@/lib/db/connection";
import { getMonotonicTime } from "@/lib/utils";
import logger from "@/lib/utils/logger";
import { retryWithThrow } from "@/lib/utils/retry";
import type { DataFetchOperationSummary } from "@/types/lib";
import {
  GITHUB_ACTIVITY_PRESERVED_DATA_RETRY,
  GitHubActivityRefreshPreservedError,
} from "@/lib/data-access/github-refresh-outcome";

const OPERATION = "github-activity";

export async function runGitHubActivityRefresh(): Promise<DataFetchOperationSummary> {
  const startTime = getMonotonicTime();
  const databaseAccess = resolveDatabaseAccessMode();

  if (!databaseAccess.allowWrites) {
    logger.info("[DataFetchManager] GitHub activity fetch skipped in read-only environment", {
      environment: databaseAccess.environment,
      source: databaseAccess.source,
    });
    return {
      success: true,
      operation: OPERATION,
      itemsProcessed: 0,
      duration: (getMonotonicTime() - startTime) / 1000,
    };
  }

  logger.info("[DataFetchManager] Starting GitHub activity fetch...");

  try {
    const refreshed = await retryWithThrow(
      async () => {
        const result = await refreshGitHubActivityDataFromApi();
        if (!result) {
          throw new Error("GitHub activity refresh returned null");
        }
        return result;
      },
      {
        ...GITHUB_ACTIVITY_PRESERVED_DATA_RETRY,
        isRetryable: (error) => error instanceof GitHubActivityRefreshPreservedError,
        onRetry: (error, attempt) => {
          if (error instanceof GitHubActivityRefreshPreservedError) {
            logger.warn("[DataFetchManager] Retrying preserved GitHub activity refresh", {
              reason: error.reason,
              attempt,
              maxAttempts: GITHUB_ACTIVITY_PRESERVED_DATA_RETRY.maxRetries + 1,
            });
          }
        },
      },
    );

    logger.info(
      `[DataFetchManager] GitHub activity fetched - Trailing year: ${refreshed.trailingYearData.totalContributions}, All-time: ${refreshed.allTimeData.totalContributions}`,
    );

    try {
      const { invalidateAllGitHubCaches } = await import("@/lib/cache/invalidation");
      invalidateAllGitHubCaches();
      logger.info("[DataFetchManager] GitHub caches invalidated after data fetch");
    } catch (cacheError) {
      logger.warn("[DataFetchManager] Cache invalidation failed (non-fatal):", cacheError);
    }

    return {
      success: true,
      operation: OPERATION,
      itemsProcessed: refreshed.trailingYearData.totalContributions,
      duration: (getMonotonicTime() - startTime) / 1000,
    };
  } catch (error: unknown) {
    if (error instanceof GitHubActivityRefreshPreservedError) {
      logger.warn(
        "[DataFetchManager] GitHub activity refresh completed as a preserved-data no-op after bounded retries",
        {
          degraded: error.degraded,
          reason: error.reason,
          retryable: error.retryable,
          retries: GITHUB_ACTIVITY_PRESERVED_DATA_RETRY.maxRetries,
        },
      );
      return {
        success: true,
        operation: OPERATION,
        itemsProcessed: 0,
        duration: (getMonotonicTime() - startTime) / 1000,
      };
    }

    const capturedError = error instanceof Error ? error : new Error(String(error));
    Sentry.captureException?.(capturedError);
    logger.error("[DataFetchManager] GitHub activity fetch failed:", capturedError);
    return {
      success: false,
      operation: OPERATION,
      error: capturedError.message,
      duration: (getMonotonicTime() - startTime) / 1000,
    };
  }
}
