/** Bounded retry policy for a refresh that safely preserved healthier existing activity. */
export const GITHUB_ACTIVITY_PRESERVED_DATA_RETRY = {
  maxRetries: 2,
  baseDelay: 5_000,
  maxBackoff: 10_000,
} as const;

/** Expected degraded no-op when a non-degrading write preserves healthy existing activity. */
export class GitHubActivityRefreshPreservedError extends Error {
  readonly degraded = true;
  readonly reason = "preserved-healthy-activity";
  readonly retryable = true;

  constructor() {
    super("GitHub activity refresh preserved existing healthy activity data.");
    this.name = "GitHubActivityRefreshPreservedError";
  }
}
