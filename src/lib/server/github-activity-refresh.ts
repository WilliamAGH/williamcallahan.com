import * as Sentry from "@sentry/nextjs";
import { refreshGitHubActivityDataFromApi } from "@/lib/data-access/github";
import { readGitHubActivityRecord } from "@/lib/data-access/github-storage";
import { resolveDatabaseAccessMode } from "@/lib/db/connection";
import { getMonotonicTime } from "@/lib/utils";
import logger from "@/lib/utils/logger";
import {
  createGitHubRefreshBudget,
  GitHubRefreshDeadlineError,
  retryGitHubOperation,
} from "@/lib/data-access/github-refresh-budget";
import type { DataFetchOperationSummary } from "@/types/lib";
import {
  GITHUB_ACTIVITY_PRESERVED_DATA_RETRY,
  GitHubActivityRefreshPreservedError,
  GitHubUpstreamUnavailableError,
} from "@/lib/data-access/github-refresh-outcome";

const OPERATION = "github-activity";

type GitHubActivityRefreshSummary = DataFetchOperationSummary &
  (
    | {
        degraded: true;
        reason:
          | GitHubActivityRefreshPreservedError["reason"]
          | GitHubUpstreamUnavailableError["reason"]
          | GitHubRefreshDeadlineError["reason"];
      }
    | { degraded?: false; reason?: never }
  );

export async function runGitHubActivityRefresh(): Promise<GitHubActivityRefreshSummary> {
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
  const budget = createGitHubRefreshBudget();

  try {
    const refreshed = await retryGitHubOperation(
      async () => {
        const result = await refreshGitHubActivityDataFromApi(budget.signal);
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
      budget.signal,
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
        degraded: true,
        reason: error.reason,
        duration: (getMonotonicTime() - startTime) / 1000,
      };
    }

    let failure = error;
    if (
      error instanceof GitHubUpstreamUnavailableError ||
      error instanceof GitHubRefreshDeadlineError
    ) {
      try {
        // This read validates the persisted payload. No cache or timestamp is rewritten.
        const retained = await readGitHubActivityRecord();
        if (retained) {
          logger.warn("[DataFetchManager] GitHub refresh degraded; retaining prior activity", {
            degraded: true,
            reason: error.reason,
          });
          return {
            success: true,
            operation: OPERATION,
            itemsProcessed: 0,
            degraded: true,
            reason: error.reason,
            duration: (getMonotonicTime() - startTime) / 1000,
          };
        }
      } catch (retainedReadError) {
        failure = retainedReadError;
      }
    }

    const capturedError = failure instanceof Error ? failure : new Error(String(failure));
    Sentry.captureException?.(capturedError);
    logger.error("[DataFetchManager] GitHub activity fetch failed:", capturedError);
    return {
      success: false,
      operation: OPERATION,
      error: capturedError.message,
      duration: (getMonotonicTime() - startTime) / 1000,
    };
  } finally {
    budget.dispose();
  }
}
