import type { RepoWeeklyStatCache } from "@/types/schemas/github-storage";

const PENDING_CONTRIBUTOR_STATS = "pending_202_from_api";

/** Expected no-op when GitHub is still generating every incomplete contributor-stat result. */
export class GitHubActivityRefreshPreservedError extends Error {
  readonly reason = "pending-contributor-stats";

  constructor() {
    super("GitHub activity refresh preserved existing data while contributor stats are pending.");
    this.name = "GitHubActivityRefreshPreservedError";
  }
}

export function isPendingContributorStatsOnly(
  incompleteRepoStatuses: readonly RepoWeeklyStatCache["status"][],
  failedRepoCount: number,
): boolean {
  return (
    failedRepoCount === 0 &&
    incompleteRepoStatuses.length > 0 &&
    incompleteRepoStatuses.every((status) => status === PENDING_CONTRIBUTOR_STATS)
  );
}
