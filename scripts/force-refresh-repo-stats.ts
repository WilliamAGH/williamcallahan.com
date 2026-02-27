#!/usr/bin/env ts-node
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

import type { GithubContributorStatsEntry, RepoRawWeeklyStat } from "@/types/github";
import { writeRepoWeeklyStatsToDb } from "@/lib/db/mutations/github-activity";

// Support both the new preferred env var and legacy common names to reduce mis-config issues.
const GITHUB_API_TOKEN =
  process.env.GITHUB_ACCESS_TOKEN_COMMIT_GRAPH ||
  process.env.GITHUB_API_TOKEN ||
  process.env.GITHUB_TOKEN;
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER || "WilliamAGH";

const REPOS_TO_PROCESS: RepoToUpdate[] = [
  { owner: "aventurevc", name: "data-fusion-processor" },
  { owner: "WilliamAGH", name: "FlywayAutoPilot" },
  // Add more repos here if needed for future use
];

/**
 * Fetches weekly contributor statistics for a specific user from a GitHub repository
 *
 * Retrieves contributor stats from GitHub API with exponential backoff
 *
 * @param owner - The GitHub username or organization that owns the repository
 * @param name - The name of the repository
 * @returns Weekly contribution statistics for the repository owner, sorted by timestamp
 * @remark Retries up to 5 times if GitHub API responds with 202 status
 */
async function fetchStatsForRepo(owner: string, name: string): Promise<RepoRawWeeklyStat[]> {
  console.log(`[Script] Fetching contributor stats for ${owner}/${name} from GitHub API...`);
  const url = `https://api.github.com/repos/${owner}/${name}/stats/contributors`;
  let attempt = 0;
  const maxAttempts = 5;
  let delay = 1000;

  while (attempt < maxAttempts) {
    attempt++;
    console.log(`[Script] Attempt ${attempt} for ${url}`);
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${GITHUB_API_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (response.ok) {
      const contributors = (await response.json()) as GithubContributorStatsEntry[];
      const ownerLoginLower = GITHUB_REPO_OWNER.toLowerCase();
      const userStatsEntry = Array.isArray(contributors)
        ? contributors.find((c) => c.author && c.author.login.toLowerCase() === ownerLoginLower)
        : null;

      if (userStatsEntry?.weeks && Array.isArray(userStatsEntry.weeks)) {
        console.log(
          `[Script] Successfully fetched stats for ${owner}/${name}. Found ${userStatsEntry.weeks.length} weeks of activity.`,
        );
        return userStatsEntry.weeks
          .map((w: RepoRawWeeklyStat) => ({ w: w.w, a: w.a, d: w.d, c: w.c }))
          .toSorted((a, b) => a.w - b.w);
      }
      console.log(
        `[Script] No specific stats found for user ${GITHUB_REPO_OWNER} in ${owner}/${name}.`,
      );
      return [];
    }

    if (response.status === 202) {
      console.log(
        `[Script] GitHub API returned 202 (Accepted) for ${owner}/${name}. Data is being prepared. Waiting ${delay / 1000}s before retry (${attempt}/${maxAttempts}).`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
      continue;
    }

    console.error(
      `[Script] Error fetching stats for ${owner}/${name}: ${response.status} ${await response.text()}`,
    );
    return []; // Return empty on persistent error
  }
  console.warn(`[Script] Max retries reached for ${owner}/${name}. Could not fetch stats.`);
  return [];
}

/**
 * Processes a repository by fetching stats and writing to PostgreSQL.
 *
 * @param repo - The repository to process, including owner and name
 */
async function processRepo(repo: RepoToUpdate) {
  console.log(`\n[Script] Processing repository: ${repo.owner}/${repo.name}`);
  const weeklyStats = await fetchStatsForRepo(repo.owner, repo.name);

  try {
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
      `[Script] Failed to write PostgreSQL weekly stats for ${repo.owner}/${repo.name}:`,
      error,
    );
  }
}

/**
 * Orchestrates refresh of GitHub stats for configured repositories
 *
 * Validates environment variables before processing
 * Advises triggering full data refresh after completion
 */
async function main() {
  if (!GITHUB_API_TOKEN) {
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
    "[Script] IMPORTANT: After running this script, trigger a full refresh (POST /api/github-activity/refresh or scripts/data-updater.ts) so summary and aggregated activity rows are recalculated from updated repository stats.",
  );
}

main().catch((error) => {
  console.error("[Script] Unhandled error in main execution:", error);
  process.exit(1);
});
