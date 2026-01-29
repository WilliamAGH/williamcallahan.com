/**
 * GitHub API Client Module
 *
 * Handles all direct interactions with GitHub's GraphQL and REST APIs
 * Includes rate limiting, retries, and proper error handling
 *
 * @module data-access/github-api
 */

import { createGitHubGraphQLClient } from "@/lib/utils/graphql-client";
import { createRetryingFetch } from "@/lib/utils/http-client";
import { waitForPermit } from "@/lib/rate-limiter";
import { debugLog } from "@/lib/utils/debug";
import { retryWithOptions, RETRY_CONFIGS, delay } from "@/lib/utils/retry";
import {
  GitHubGraphQLContributionResponseSchema,
  GraphQLUserContributionsResponseSchema,
  GraphQLCommitHistoryResponseSchema,
  ContributorStatsResponseSchema,
  type GithubRepoNode,
  type GraphQLUserContributionsResponse,
  type GithubContributorStatsEntry,
} from "@/types/github";
import { GITHUB_API_RATE_LIMIT_CONFIG } from "@/lib/constants";
// GitHub API configuration
const GITHUB_API_TOKEN =
  process.env.GITHUB_ACCESS_TOKEN_COMMIT_GRAPH ||
  process.env.GITHUB_API_TOKEN ||
  process.env.GITHUB_TOKEN;

const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER || "WilliamAGH";

// Create configured HTTP client for GitHub REST API using consolidated configuration
export const githubHttpClient = createRetryingFetch(
  RETRY_CONFIGS.GITHUB_API.maxRetries,
  RETRY_CONFIGS.GITHUB_API.baseDelay,
  RETRY_CONFIGS.GITHUB_API,
);

// Create GraphQL client singleton
let graphQLClient: ReturnType<typeof createGitHubGraphQLClient> | null = null;

function getGitHubGraphQLClient() {
  if (!graphQLClient) {
    if (!GITHUB_API_TOKEN) {
      throw new Error("GitHub API token is not configured");
    }
    graphQLClient = createGitHubGraphQLClient(GITHUB_API_TOKEN, {
      debug: process.env.NODE_ENV === "development",
    });
  }
  return graphQLClient;
}

// NEW: Custom error to indicate that the GitHub /stats/contributors endpoint
// has returned HTTP 202 (stats are being generated). This allows callers to
// distinguish an expected pending state from an actual fetch/parsing failure.
export class GitHubContributorStatsPendingError extends Error {
  constructor(message: string = "GitHub contributor stats are still being generated (HTTP 202)") {
    super(message);
    this.name = "GitHubContributorStatsPendingError";
  }
}

// Custom error for GitHub rate limiting
export class GitHubContributorStatsRateLimitError extends Error {
  constructor(message: string = "GitHub API rate limit hit (HTTP 403)") {
    super(message);
    this.name = "GitHubContributorStatsRateLimitError";
  }
}

/**
 * Fetch contributed repositories for a user
 */
export async function fetchContributedRepositories(username: string): Promise<{
  userId: string;
  repositories: GithubRepoNode[];
}> {
  await waitForPermit("github-graphql", "contributed-repos", GITHUB_API_RATE_LIMIT_CONFIG);

  const client = getGitHubGraphQLClient();
  const rawResponse = await client.query<unknown>(
    `
    query($username: String!) {
      user(login: $username) {
        id
        repositoriesContributedTo(
          first: 100,
          contributionTypes: [COMMIT],
          includeUserRepositories: true,
          orderBy: { field: PUSHED_AT, direction: DESC }
        ) {
          nodes { id name owner { login } nameWithOwner isFork isPrivate }
        }
      }
    }
    `,
    { username },
  );

  const response = GitHubGraphQLContributionResponseSchema.parse(rawResponse);
  const { user } = response;

  if (!user?.id) {
    throw new Error(`Failed to fetch user ID for ${username}`);
  }

  const repositories = (user.repositoriesContributedTo?.nodes || []).filter(
    (repo): repo is GithubRepoNode => !!(repo && !repo.isFork),
  );

  return { userId: user.id, repositories };
}

/**
 * Fetch contribution calendar data
 */
export async function fetchContributionCalendar(
  username: string,
  from?: string,
  to?: string,
): Promise<GraphQLUserContributionsResponse> {
  await waitForPermit("github-graphql", "contribution-calendar", GITHUB_API_RATE_LIMIT_CONFIG);

  const client = getGitHubGraphQLClient();
  const rawResponse = await client.query<unknown>(
    `
    query($username: String!, $from: DateTime, $to: DateTime) {
      user(login: $username) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                contributionLevel
                date
              }
            }
          }
        }
      }
    }
    `,
    { username, from, to },
  );

  return GraphQLUserContributionsResponseSchema.parse(rawResponse);
}

/**
 * Fetch commit count for a repository
 */
export async function fetchRepositoryCommitCount(
  owner: string,
  name: string,
  authorId: string,
): Promise<number> {
  await waitForPermit("github-graphql", "commit-count", GITHUB_API_RATE_LIMIT_CONFIG);

  const client = getGitHubGraphQLClient();
  const rawResponse = await client.query<unknown>(
    `
    query($owner: String!, $name: String!, $authorId: ID!) {
      repository(owner: $owner, name: $name) {
        object(expression: "HEAD") {
          ... on Commit {
            history(author: { id: $authorId }) {
              totalCount
            }
          }
        }
      }
    }
    `,
    { owner, name, authorId },
  );

  const response = GraphQLCommitHistoryResponseSchema.parse(rawResponse);
  return response.repository?.object?.history?.totalCount || 0;
}

/**
 * Fetch contributor stats from REST API
 */
export async function fetchContributorStats(
  owner: string,
  name: string,
): Promise<GithubContributorStatsEntry[]> {
  const maxAttempts = Number(process.env.GITHUB_STATS_PENDING_MAX_ATTEMPTS ?? "4");
  const initialDelayMs = Number(process.env.GITHUB_STATS_PENDING_DELAY_MS ?? "10000"); // 10s default

  let attempt = 0;
  let currentDelay = initialDelayMs;

  while (attempt < maxAttempts) {
    attempt++;
    await waitForPermit("github-rest", "contributor-stats", GITHUB_API_RATE_LIMIT_CONFIG);

    const url = `https://api.github.com/repos/${owner}/${name}/stats/contributors`;
    const response = await githubHttpClient(url, {
      headers: {
        Authorization: `token ${GITHUB_API_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    // Explicitly detect HTTP 202 – GitHub is preparing the statistics.
    if (response.status === 202) {
      // If we have more attempts remaining, wait and retry; otherwise propagate pending error.
      if (attempt < maxAttempts) {
        debugLog(
          `GitHub contributor stats still pending for ${owner}/${name} (attempt ${attempt}/${maxAttempts}). Retrying in ${currentDelay}ms`,
          "info",
        );
        await delay(currentDelay);
        currentDelay *= 2; // exponential back-off
        continue;
      }
      throw new GitHubContributorStatsPendingError(
        `Contributor stats for ${owner}/${name} are still generating on GitHub (HTTP 202) after ${maxAttempts} attempts.`,
      );
    }

    if (response.status === 403) {
      // Immediately throw rate limit error so caller can mark pending_rate_limit
      throw new GitHubContributorStatsRateLimitError(
        `GitHub rate limit encountered fetching contributor stats for ${owner}/${name}.`,
      );
    }

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const contributorsData: unknown = await response.json();
    const result = ContributorStatsResponseSchema.safeParse(contributorsData);

    if (!result.success) {
      // If the data isn't an array yet, GitHub may still be generating stats.
      // Treat this the same as 202 pending so callers can retry later.
      throw new GitHubContributorStatsPendingError(
        `GitHub returned unparseable contributor stats for ${owner}/${name}; stats may still be generating.`,
      );
    }

    return result.data;
  }
  // If loop exits unexpectedly without return, throw pending error
  throw new GitHubContributorStatsPendingError(
    `Contributor stats for ${owner}/${name} did not become available after ${maxAttempts} attempts.`,
  );
}

/**
 * Check if API is configured
 */
export function isGitHubApiConfigured(): boolean {
  return !!GITHUB_API_TOKEN;
}

/**
 * Get configured GitHub username
 */
export function getGitHubUsername(): string {
  return GITHUB_REPO_OWNER;
}

/**
 * Get GitHub API token from environment
 * @see {@link src/lib/data-access/github-api.ts} - Single source of truth for GitHub auth
 */
export function getGitHubApiToken(): string | undefined {
  return GITHUB_API_TOKEN;
}

/**
 * Fetch with advanced retry logic for critical operations
 * Similar to opengraph/fetch.ts but tailored for GitHub API
 */
export async function fetchWithAdvancedRetry<T>(
  operation: () => Promise<T>,
  context: string,
): Promise<T | null> {
  return retryWithOptions(operation, {
    ...RETRY_CONFIGS.GITHUB_API,
    onRetry: (error: unknown, attempt: number) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isRateLimit = errorMessage.includes("403") || errorMessage.includes("429");
      const is202 = errorMessage.includes("202");

      if (isRateLimit) {
        debugLog(`GitHub API rate limit hit for ${context}`, "warn", { attempt });
      } else if (is202) {
        debugLog(`GitHub API data generation in progress for ${context}`, "info", { attempt });
      } else {
        debugLog(`GitHub API retry for ${context}`, "warn", { attempt, error: errorMessage });
      }
    },
  });
}
