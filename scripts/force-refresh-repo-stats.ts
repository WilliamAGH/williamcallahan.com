#!/usr/bin/env tsx
/**
 * GitHub Repository Statistics Refresh Script
 *
 * Forces refresh of GitHub contributor statistics for specific repositories
 * Updates PostgreSQL storage with latest contributor data from GitHub API
 *
 * @module scripts/force-refresh-repo-stats
 */

import type { RepoToUpdate } from "@/types/lib";

import "dotenv/config"; // Load .env variables

import {
  fetchContributorStats,
  getGitHubUsername,
  isGitHubApiConfigured,
} from "@/lib/data-access/github-api";
import { filterContributorStats } from "@/lib/data-access/github-processing";
import { writeRepoWeeklyStatsToDb } from "@/lib/db/mutations/github-activity";

const GITHUB_REPO_OWNER = getGitHubUsername();

const REPOS_TO_PROCESS: RepoToUpdate[] = [
  { owner: "aventurevc", name: "data-fusion-processor" },
  { owner: "WilliamAGH", name: "FlywayAutoPilot" },
  // Add more repos here if needed for future use
];

/**
 * Processes a repository by fetching stats and writing to PostgreSQL.
 *
 * @param repo - The repository to process, including owner and name
 */
async function processRepo(repo: RepoToUpdate) {
  console.log(`\n[Script] Processing repository: ${repo.owner}/${repo.name}`);
  try {
    const contributors = await fetchContributorStats(repo.owner, repo.name, GITHUB_REPO_OWNER);
    const weeklyStats = (
      filterContributorStats(contributors, GITHUB_REPO_OWNER)?.weeks ?? []
    ).toSorted((a, b) => a.w - b.w);
    await writeRepoWeeklyStatsToDb(repo.owner, repo.name, {
      repoOwnerLogin: repo.owner,
      repoName: repo.name,
      lastFetched: new Date().toISOString(),
      status: weeklyStats.length > 0 ? "complete" : "empty_no_user_contribs",
      stats: weeklyStats,
    });

    console.log(
      `[Script] Updated PostgreSQL weekly stats for ${repo.owner}/${repo.name} with ${weeklyStats.length} weeks of data.`,
    );
  } catch (error) {
    console.error(
      `[Script] Repository refresh failed; existing statistics retained for ${repo.owner}/${repo.name}:`,
      error,
    );
    process.exitCode = 1;
  }
}

/**
 * Orchestrates refresh of GitHub stats for configured repositories
 *
 * Validates environment variables before processing
 * Advises triggering full data refresh after completion
 */
async function main() {
  if (!isGitHubApiConfigured()) {
    console.error("GITHUB_ACCESS_TOKEN_COMMIT_GRAPH is not set in .env. Aborting.");
    return;
  }

  console.log(
    "[Script] Starting forceful refresh of specified repo stats from /stats/contributors API...",
  );
  for (const repo of REPOS_TO_PROCESS) {
    await processRepo(repo);
  }
  console.log("\n[Script] Forceful refresh process finished.");
  console.log(
    "[Script] IMPORTANT: After running this script, trigger a full refresh (POST /api/github-activity/refresh or scheduler/data-updater.ts) so summary and aggregated activity rows are recalculated from updated repository stats.",
  );
}

main().catch((error) => {
  console.error("[Script] Unhandled error in main execution:", error);
  process.exitCode = 1;
});
