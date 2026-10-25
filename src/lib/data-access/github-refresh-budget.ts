import type { RetryConfig } from "@/types/lib";
import { computeExponentialDelay } from "@/lib/utils/retry";

/** >2x the observed 266s refresh, inside the scheduler's 15-minute startup allowance. */
export const GITHUB_ACTIVITY_TOTAL_BUDGET_MS = 10 * 60 * 1_000;

export class GitHubRefreshDeadlineError extends Error {
  readonly reason = "refresh-deadline";
  constructor() {
    super("GitHub activity refresh exhausted its 10-minute total collection budget.");
    this.name = "GitHubRefreshDeadlineError";
  }
}

export function createGitHubRefreshBudget() {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new GitHubRefreshDeadlineError()),
    GITHUB_ACTIVITY_TOTAL_BUDGET_MS,
  );
  return { signal: controller.signal, dispose: () => clearTimeout(timer) };
}

/** Cancel the timer itself, not just the caller's wait on it. */
export async function waitForGitHubRetry(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    function abort() {
      clearTimeout(timer);
      reject(signal?.reason);
    }
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/** GitHub-owned retry waits share the caller's total budget. */
export async function retryGitHubOperation<T>(
  operation: () => Promise<T>,
  options: RetryConfig,
  signal?: AbortSignal,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try {
      return await operation();
    } catch (error) {
      if (!options.isRetryable?.(error)) throw error;
      signal?.throwIfAborted();
      if (attempt >= (options.maxRetries ?? 3)) throw error;
      options.onRetry?.(error, attempt + 1);
      await waitForGitHubRetry(
        computeExponentialDelay(
          attempt + 1,
          options.baseDelay ?? 1_000,
          options.maxBackoff ?? 30_000,
          options.jitter ? 0.2 : 0,
        ),
        signal,
      );
    }
  }
}
