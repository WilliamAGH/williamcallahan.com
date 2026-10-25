/** Bounded retry policy for a refresh that safely preserved healthier existing activity. */
export const GITHUB_ACTIVITY_PRESERVED_DATA_RETRY = {
  maxRetries: 2,
  baseDelay: 5_000,
  maxBackoff: 10_000,
} as const;

/** Per-query retries; this is not a total refresh deadline. */
export const GITHUB_ACTIVITY_UPSTREAM_RETRY = {
  maxRetries: 3,
  baseDelay: 1_000,
  maxBackoff: 4_000,
} as const;

/** Only GitHub's upstream boundary may classify a failure as transient. */
export class GitHubUpstreamUnavailableError extends Error {
  constructor(
    readonly reason: "upstream-timeout" | "upstream-rate-limit" | "upstream-unavailable",
    cause: Error,
  ) {
    super(cause.message, { cause });
    this.name = "GitHubUpstreamUnavailableError";
  }
}

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
