/**
 * GitHub repository stats aggregation
 * @module data-access/github-repo-stats
 */

import { BatchProcessor } from "@/lib/batch-processing";
import { categorizeRepository, createEmptyCategoryStats } from "./github-processing";
import { processSingleRepository } from "./github-repo-processor";
import type {
  CommitsOlderThanYearSummary,
  GithubRepoNode,
  GitHubActivitySummary,
} from "@/types/github";
import type {
  RepoProcessingInput,
  RepoProcessingResult,
  RepoWithResult,
  SingleRepoProcessingResult,
} from "@/types/features/github-processing";

const CONCURRENT_REPO_LIMIT = 5;

function initializeOlderThanYearStats(): CommitsOlderThanYearSummary {
  return {
    totalCommits: 0,
    totalLinesAdded: 0,
    totalLinesRemoved: 0,
    publicCommits: 0,
    privateCommits: 0,
    perRepo: {},
  };
}

function accumulateOlderThanYearStats(
  stats: CommitsOlderThanYearSummary,
  repo: GithubRepoNode,
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

function accumulateCategoryStats(
  yearStats: GitHubActivitySummary["linesOfCodeByCategory"],
  allTimeStats: GitHubActivitySummary["linesOfCodeByCategory"],
  repo: GithubRepoNode,
  result: SingleRepoProcessingResult,
): void {
  const categoryKey = categorizeRepository(repo.name);

  if (result.yearLinesAdded > 0 || result.yearLinesRemoved > 0 || result.dataComplete) {
    yearStats[categoryKey].linesAdded += result.yearLinesAdded;
    yearStats[categoryKey].linesRemoved += result.yearLinesRemoved;
    yearStats[categoryKey].repoCount += 1;
    yearStats[categoryKey].netChange =
      (yearStats[categoryKey].netChange || 0) + (result.yearLinesAdded - result.yearLinesRemoved);
  }

  if (result.hasAllTimeData) {
    allTimeStats[categoryKey].linesAdded += result.allTimeLinesAdded;
    allTimeStats[categoryKey].linesRemoved += result.allTimeLinesRemoved;
    allTimeStats[categoryKey].netChange =
      (allTimeStats[categoryKey].netChange || 0) +
      (result.allTimeLinesAdded - result.allTimeLinesRemoved);
  }
}

function aggregateResults(repoResults: RepoWithResult[]): RepoProcessingResult {
  let yearLinesAdded = 0;
  let yearLinesRemoved = 0;
  let allTimeLinesAdded = 0;
  let allTimeLinesRemoved = 0;
  let allTimeOverallDataComplete = true;

  const yearCategoryStats = createEmptyCategoryStats();
  const allTimeCategoryStats = createEmptyCategoryStats();
  const olderThanYearCommitStats = initializeOlderThanYearStats();

  for (const { repo, result } of repoResults) {
    yearLinesAdded += result.yearLinesAdded;
    yearLinesRemoved += result.yearLinesRemoved;
    allTimeLinesAdded += result.allTimeLinesAdded;
    allTimeLinesRemoved += result.allTimeLinesRemoved;

    if (!result.dataComplete) {
      allTimeOverallDataComplete = false;
    }

    accumulateOlderThanYearStats(olderThanYearCommitStats, repo, result);
    accumulateCategoryStats(yearCategoryStats, allTimeCategoryStats, repo, result);
  }

  return {
    yearLinesAdded,
    yearLinesRemoved,
    yearCategoryStats,
    olderThanYearCommitStats,
    allTimeLinesAdded,
    allTimeLinesRemoved,
    allTimeOverallDataComplete,
    allTimeCategoryStats,
    failedRepoCount: 0,
  };
}

export async function processRepositoryStats({
  repos,
  githubRepoOwner,
  trailingYearFromDate,
  now,
}: RepoProcessingInput): Promise<RepoProcessingResult> {
  const successfulResults: RepoWithResult[] = [];

  const repoProcessor = new BatchProcessor<GithubRepoNode, SingleRepoProcessingResult>(
    "github-repo-stats",
    async (repo) =>
      processSingleRepository({
        repo,
        githubRepoOwner,
        trailingYearFromDate,
        now,
      }),
    {
      batchSize: CONCURRENT_REPO_LIMIT,
      timeout: 300000,
      onProgress: (current, total, failed) => {
        console.log(
          `[DataAccess/GitHub] Processing repositories: ${current}/${total} (${failed} failed)`,
        );
      },
    },
  );

  const batchResults = await repoProcessor.processBatch(repos);

  // Collect successful results with their repos
  for (const [repo, result] of batchResults.successful.entries()) {
    successfulResults.push({ repo, result });
  }

  const aggregated = aggregateResults(successfulResults);

  if (batchResults.failed.size > 0) {
    console.warn(`[DataAccess/GitHub] Failed to process ${batchResults.failed.size} repositories`);
  }

  return {
    ...aggregated,
    failedRepoCount: batchResults.failed.size,
  };
}
