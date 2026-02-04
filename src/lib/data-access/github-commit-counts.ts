/**
 * GitHub commit count aggregation
 * @module data-access/github-commit-counts
 */

import { debug } from "@/lib/utils/debug";
import { waitForPermit } from "@/lib/rate-limiter";
import { delay, retryWithDomainConfig } from "@/lib/utils/retry";
import { createCategorizedError } from "@/lib/utils/error-utils";
import { CommitResponseSchema, type GithubRepoNode } from "@/types/github";
import { GITHUB_API_RATE_LIMIT_CONFIG } from "@/lib/constants";
import { fetchRepositoryCommitCount, getGitHubApiToken, githubHttpClient } from "./github-api";

type CommitCountInput = {
  repos: GithubRepoNode[];
  githubRepoOwner: string;
  githubUserId?: string;
};

const MAX_PAGES = 100;
const COMMITS_PER_PAGE = 100;

type PageFetchResult =
  | { status: "success"; count: number; hasMore: boolean }
  | { status: "error"; message: string }
  | { status: "invalid_data" };

async function fetchCommitsPage(
  owner: string,
  name: string,
  githubRepoOwner: string,
  page: number,
): Promise<PageFetchResult> {
  const url = `https://api.github.com/repos/${owner}/${name}/commits?author=${githubRepoOwner}&per_page=${COMMITS_PER_PAGE}&page=${page}`;

  const res = await retryWithDomainConfig(async () => {
    await waitForPermit("github-rest", "github-api-call", GITHUB_API_RATE_LIMIT_CONFIG);
    return await githubHttpClient(url, {
      headers: {
        Authorization: `Bearer ${getGitHubApiToken()}`,
        Accept: "application/vnd.github.v3+json",
      },
      timeout: 30000,
    });
  }, "GITHUB_API");

  if (!res?.ok) {
    return { status: "error", message: `HTTP ${res?.status || "unknown"}` };
  }

  const data: unknown = await res.json();
  const parsed = CommitResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { status: "invalid_data" };
  }

  const commits = parsed.data;
  return {
    status: "success",
    count: commits.length,
    hasMore: commits.length >= COMMITS_PER_PAGE,
  };
}

async function countCommitsViaRestApi(
  owner: string,
  name: string,
  githubRepoOwner: string,
): Promise<number> {
  let totalCommits = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    try {
      const result = await fetchCommitsPage(owner, name, githubRepoOwner, page);

      if (result.status === "error") {
        console.warn(`[GitHub-Commits] Error for ${owner}/${name} page ${page}: ${result.message}`);
        break;
      }

      if (result.status === "invalid_data") {
        console.warn(`[GitHub-Commits] Invalid data for ${owner}/${name} page ${page}`);
        break;
      }

      totalCommits += result.count;

      if (!result.hasMore) {
        break;
      }

      if (page > 20) {
        debug(`[GitHub-Commits] Deep pagination for ${owner}/${name}: ${page} pages`);
      }

      await delay(100);
    } catch (pageError: unknown) {
      const categorized = createCategorizedError(pageError, "github");
      console.warn(
        `[GitHub-Commits] Failed page ${page} for ${owner}/${name}:`,
        categorized.message,
      );
      break;
    }
  }

  return totalCommits;
}

async function countRepositoryCommits(
  repo: GithubRepoNode,
  githubRepoOwner: string,
  githubUserId?: string,
): Promise<number> {
  const owner = repo.owner.login;
  const name = repo.name;

  debug(`[GitHub-Commits] Fetching commits for ${owner}/${name}...`);

  // Try GraphQL first if we have user ID
  if (githubUserId) {
    try {
      const count = await fetchRepositoryCommitCount(owner, name, githubUserId);
      debug(`[GitHub-Commits] ${owner}/${name}: ${count} commits via GraphQL`);
      return count;
    } catch (error: unknown) {
      const categorized = createCategorizedError(error, "github");
      console.warn(`[GitHub-Commits] GraphQL failed for ${owner}/${name}:`, categorized.message);
    }
  } else {
    console.warn(`[GitHub-Commits] No user ID for GraphQL, using REST for ${owner}/${name}`);
  }

  // Fallback to REST API pagination
  console.log(`[GitHub-Commits] Using REST API for ${owner}/${name}...`);
  return countCommitsViaRestApi(owner, name, githubRepoOwner);
}

export async function calculateAllTimeCommitCount({
  repos,
  githubRepoOwner,
  githubUserId,
}: CommitCountInput): Promise<number> {
  console.log("[GitHub-Commits] Calculating all-time commit counts...");

  let allTimeTotalCommits = 0;

  for (const repo of repos) {
    const count = await countRepositoryCommits(repo, githubRepoOwner, githubUserId);
    allTimeTotalCommits += count;
  }

  console.log(`[GitHub-Commits] Total commits: ${allTimeTotalCommits}`);
  return allTimeTotalCommits;
}
