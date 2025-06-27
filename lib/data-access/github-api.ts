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
import { retryWithOptions, RETRY_CONFIGS } from "@/lib/utils/retry";
import {
  GitHubGraphQLContributionResponseSchema,
  GraphQLUserContributionsResponseSchema,
  GraphQLCommitHistoryResponseSchema,
  ContributorStatsResponseSchema,
} from "@/types/github";
import type { GithubRepoNode, GraphQLUserContributionsResponse, GithubContributorStatsEntry } from "@/types/github";
// GitHub API configuration
const GITHUB_API_TOKEN =
  process.env.GITHUB_ACCESS_TOKEN_COMMIT_GRAPH || process.env.GITHUB_API_TOKEN || process.env.GITHUB_TOKEN;

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

/**
 * Fetch contributed repositories for a user
 */
export async function fetchContributedRepositories(username: string): Promise<{
  userId: string;
  repositories: GithubRepoNode[];
}> {
  await waitForPermit("github-graphql", "contributed-repos", {
    maxRequests: 5000,
    windowMs: 60 * 60 * 1000, // 1 hour
  });

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
  await waitForPermit("github-graphql", "contribution-calendar", {
    maxRequests: 5000,
    windowMs: 60 * 60 * 1000,
  });

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
export async function fetchRepositoryCommitCount(owner: string, name: string, authorId: string): Promise<number> {
  await waitForPermit("github-graphql", "commit-count", {
    maxRequests: 5000,
    windowMs: 60 * 60 * 1000,
  });

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
export async function fetchContributorStats(owner: string, name: string): Promise<GithubContributorStatsEntry[]> {
  await waitForPermit("github-rest", "contributor-stats", {
    maxRequests: 5000,
    windowMs: 60 * 60 * 1000,
  });

  const url = `https://api.github.com/repos/${owner}/${name}/stats/contributors`;
  const response = await githubHttpClient(url, {
    headers: {
      Authorization: `token ${GITHUB_API_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  // Explicitly detect HTTP 202 – GitHub is preparing the statistics.
  if (response.status === 202) {
    // Throw a specialised error so upstream logic can mark "pending_202_from_api".
    throw new GitHubContributorStatsPendingError(
      `Contributor stats for ${owner}/${name} are still generating on GitHub (HTTP 202).`,
    );
  }

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const contributorsData: unknown = await response.json();
  const result = ContributorStatsResponseSchema.safeParse(contributorsData);

  if (!result.success) {
    debugLog("Failed to parse contributor stats", "error", {
      error: result.error,
      data: contributorsData,
    });
    throw new Error("Invalid contributor stats response from GitHub API");
  }

  return result.data;
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
 * Fetch with advanced retry logic for critical operations
 * Similar to opengraph/fetch.ts but tailored for GitHub API
 */
export async function fetchWithAdvancedRetry<T>(operation: () => Promise<T>, context: string): Promise<T | null> {
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
