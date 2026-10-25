/**
 * GitHub repository stats aggregation
 * @module data-access/github-repo-stats
 */

import { categorizeRepository, createEmptyCategoryStats } from "./github-processing";
import { processSingleRepository } from "./github-repo-processor";
import { waitForGitHubRetry } from "./github-refresh-budget";
import type { GraphQLRepoNode } from "@/types/github";
import type { GitHubActivitySummary, PriorYearCommitSummary } from "@/types/schemas/github-storage";
import type {
  RepoProcessingInput,
  RepoProcessingResult,
  RepoWithResult,
  SingleRepoProcessingResult,
} from "@/types/features/github-processing";

const CONCURRENT_REPO_LIMIT = 5;

function initializePriorYearStats(): PriorYearCommitSummary {
  return {
    totalCommits: 0,
    totalLinesAdded: 0,
    totalLinesRemoved: 0,
    publicCommits: 0,
    privateCommits: 0,
    perRepo: {},
  };
}

function accumulatePriorYearStats(
  stats: PriorYearCommitSummary,
  repo: GraphQLRepoNode,
  result: SingleRepoProcessingResult,
): void {
  if (
    result.olderThanYearCommits === 0 &&
    result.olderThanYearLinesAdded === 0 &&
    result.olderThanYearLinesRemoved === 0
  ) {
    return;
  }

  stats.totalCommits += result.olderThanYearCommits;
  stats.totalLinesAdded += result.olderThanYearLinesAdded;
  stats.totalLinesRemoved += result.olderThanYearLinesRemoved;

  if (repo.isPrivate) {
    stats.privateCommits += result.olderThanYearCommits;
  } else {
    stats.publicCommits += result.olderThanYearCommits;
  }

  const repoKey = repo.nameWithOwner ?? `${repo.owner.login}/${repo.name}`;
  stats.perRepo[repoKey] = {
    commits: result.olderThanYearCommits,
    linesAdded: result.olderThanYearLinesAdded,
    linesRemoved: result.olderThanYearLinesRemoved,
    isPrivate: repo.isPrivate,
  };
}

function accumulateAllTimeCategoryStats(
  allTimeStats: GitHubActivitySummary["linesOfCodeByCategory"],
  repo: GraphQLRepoNode,
  result: SingleRepoProcessingResult,
): void {
  const categoryKey = categorizeRepository(repo.name);

  if (result.hasAllTimeData) {
    allTimeStats[categoryKey].linesAdded += result.allTimeLinesAdded;
    allTimeStats[categoryKey].linesRemoved += result.allTimeLinesRemoved;
    allTimeStats[categoryKey].netChange += result.allTimeLinesAdded - result.allTimeLinesRemoved;
    allTimeStats[categoryKey].repoCount += 1;
  }
}

function aggregateResults(repoResults: RepoWithResult[]): RepoProcessingResult {
  let yearLinesAdded = 0;
  let yearLinesRemoved = 0;
  let allTimeLinesAdded = 0;
  let allTimeLinesRemoved = 0;
  let allTimeOverallDataComplete = true;

  const allTimeCategoryStats = createEmptyCategoryStats();
  const priorYearCommitStats = initializePriorYearStats();

  for (const { repo, result } of repoResults) {
    yearLinesAdded += result.yearLinesAdded;
    yearLinesRemoved += result.yearLinesRemoved;
    allTimeLinesAdded += result.allTimeLinesAdded;
    allTimeLinesRemoved += result.allTimeLinesRemoved;

    if (!result.dataComplete) {
      allTimeOverallDataComplete = false;
    }

    accumulatePriorYearStats(priorYearCommitStats, repo, result);
    accumulateAllTimeCategoryStats(allTimeCategoryStats, repo, result);
  }

  return {
    yearLinesAdded,
    yearLinesRemoved,
    priorYearCommitStats,
    allTimeLinesAdded,
    allTimeLinesRemoved,
    allTimeOverallDataComplete,
    allTimeCategoryStats,
    failedRepoCount: 0,
  };
}

export async function processRepositoryStats(
  { repos, githubRepoOwner, trailingYearFromDate, now }: RepoProcessingInput,
  signal?: AbortSignal,
): Promise<RepoProcessingResult> {
  const successfulResults: RepoWithResult[] = [];
  let failedRepoCount = 0;
  for (let offset = 0; offset < repos.length; offset += CONCURRENT_REPO_LIMIT) {
    signal?.throwIfAborted();
    const batch = repos.slice(offset, offset + CONCURRENT_REPO_LIMIT);
    // Drain every active request on cancellation before returning or starting another batch.
    const results = await Promise.allSettled(
      batch.map(async (repo) => ({
        repo,
        result: await processSingleRepository(
          { repo, githubRepoOwner, trailingYearFromDate, now },
          signal,
        ),
      })),
    );
    signal?.throwIfAborted();
    for (const result of results) {
      if (result.status === "fulfilled") successfulResults.push(result.value);
      else failedRepoCount++;
    }
    console.log(
      `[DataAccess/GitHub] Processing repositories: ${Math.min(offset + batch.length, repos.length)}/${repos.length} (${failedRepoCount} failed)`,
    );
    if (offset + batch.length < repos.length) await waitForGitHubRetry(500, signal);
  }

  const aggregated = aggregateResults(successfulResults);

  if (failedRepoCount > 0) {
    console.warn(`[DataAccess/GitHub] Failed to process ${failedRepoCount} repositories`);
  }

  return {
    ...aggregated,
    allTimeOverallDataComplete: aggregated.allTimeOverallDataComplete && failedRepoCount === 0,
    failedRepoCount,
  };
}
