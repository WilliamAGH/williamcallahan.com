import type {
  GithubRepoNode,
  GitHubActivitySummary,
  CommitsOlderThanYearSummary,
  RepoWeeklyStatCache,
} from "@/types/github";

/** Input for calculating all-time commit counts */
export type CommitCountInput = {
  repos: GithubRepoNode[];
  githubRepoOwner: string;
  githubUserId?: string;
};

/** Result of fetching a page of commits */
export type PageFetchResult =
  | { status: "success"; count: number; hasMore: boolean }
  | { status: "error"; message: string }
  | { status: "invalid_data" };

/** State for the checksum failure circuit breaker */
export type ChecksumCircuitState = {
  consecutiveFailures: number;
  isOpen: boolean;
  lastError: string | null;
};

/** Result of the CSV detection and repair process */
export type CsvRepairResult = {
  scannedRepos: number;
  repairedRepos: number;
  failedRepairs: number;
  checksumFailures: number;
  checksumCircuitOpen: boolean;
};

/** Input for processing a single repository */
export type SingleRepoProcessingInput = {
  repo: GithubRepoNode;
  githubRepoOwner: string;
  trailingYearFromDate: Date;
  now: Date;
};

/** Result of processing a single repository */
export type SingleRepoProcessingResult = {
  yearLinesAdded: number;
  yearLinesRemoved: number;
  allTimeLinesAdded: number;
  allTimeLinesRemoved: number;
  olderThanYearCommits: number;
  olderThanYearLinesAdded: number;
  olderThanYearLinesRemoved: number;
  dataComplete: boolean;
  hasAllTimeData: boolean;
};

/** Result of processing a batch of repositories */
export type RepoProcessingResult = {
  yearLinesAdded: number;
  yearLinesRemoved: number;
  yearCategoryStats: GitHubActivitySummary["linesOfCodeByCategory"];
  olderThanYearCommitStats: CommitsOlderThanYearSummary;
  allTimeLinesAdded: number;
  allTimeLinesRemoved: number;
  allTimeOverallDataComplete: boolean;
  allTimeCategoryStats: GitHubActivitySummary["linesOfCodeByCategory"];
  failedRepoCount: number;
};

/** Input for processing a batch of repositories */
export type RepoProcessingInput = {
  repos: GithubRepoNode[];
  githubRepoOwner: string;
  trailingYearFromDate: Date;
  now: Date;
};

/** Helper type for intermediate processing results */
export type RepoWithResult = {
  repo: GithubRepoNode;
  result: SingleRepoProcessingResult;
};

/**
 * Status of fetching or loading repository stats.
 * Helper type checking if status indicates an error or pending state.
 */
export function isErrorOrPendingStatus(
  status: RepoWeeklyStatCache["status"],
): status is "fetch_error" | "pending_202_from_api" | "pending_rate_limit" {
  return (
    status === "fetch_error" || status === "pending_202_from_api" || status === "pending_rate_limit"
  );
}
