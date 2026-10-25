/**
 * GitHub API Client Module
 *
 * Handles all direct interactions with GitHub's GraphQL and REST APIs
 * Includes rate limiting, retries, and proper error handling
 *
 * @module data-access/github-api
 */

/** GitHub API status codes */
const HTTP_ACCEPTED = 202;
const HTTP_NO_CONTENT = 204;
const HTTP_FORBIDDEN = 403;

import { createGitHubGraphQLClient, GraphQLError } from "@/lib/utils/graphql-client";
import { fetchWithTimeout } from "@/lib/utils/http-client";
import { isOperationAllowed } from "@/lib/rate-limiter";
import { debugLog } from "@/lib/utils/debug";
import { retryWithOptions, RETRY_CONFIGS } from "@/lib/utils/retry";
import type { FetchOptions } from "@/types/http";
import { retryGitHubOperation, waitForGitHubRetry } from "./github-refresh-budget";
import {
  GITHUB_ACTIVITY_UPSTREAM_RETRY,
  GitHubUpstreamUnavailableError,
} from "./github-refresh-outcome";
import {
  GitHubGraphQLContributionResponseSchema,
  GraphQLUserContributionsResponseSchema,
  GraphQLContributionYearsResponseSchema,
  ContributorStatsResponseSchema,
  type GraphQLRepoNode,
  type GraphQLUserContributionsResponse,
  type GithubContributorStatsEntry,
} from "@/types/github";
import { GITHUB_API_RATE_LIMIT_CONFIG } from "@/lib/constants";
import type { Result } from "@/types/lib";
// GitHub API configuration
const GITHUB_API_TOKEN =
  process.env.GITHUB_ACCESS_TOKEN_COMMIT_GRAPH ||
  process.env.GITHUB_API_TOKEN ||
  process.env.GITHUB_TOKEN;

const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER || "WilliamAGH";

// Create configured HTTP client for GitHub REST API using consolidated configuration
export const githubHttpClient = (url: string, options?: FetchOptions) =>
  retryGitHubOperation(
    () =>
      fetchWithTimeout(url, {
        ...options,
        signal: options?.signal ? AbortSignal.any([options.signal]) : undefined,
      }),
    RETRY_CONFIGS.GITHUB_API,
    options?.signal ?? undefined,
  );

async function waitForGitHubPermit(namespace: string, context: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  while (!isOperationAllowed(namespace, context, GITHUB_API_RATE_LIMIT_CONFIG)) {
    await waitForGitHubRetry(200, signal);
  }
}

// Create GraphQL client singleton
let graphQLClient: ReturnType<typeof createGitHubGraphQLClient> | null = null;

function getGitHubGraphQLClient() {
  if (!graphQLClient) {
    if (!GITHUB_API_TOKEN) {
      throw new Error("GitHub API token is not configured");
    }
    graphQLClient = createGitHubGraphQLClient(GITHUB_API_TOKEN, {
      debug: process.env.NODE_ENV === "development",
      // Retry the whole query below, including HTTP status errors, without nested retries.
      retryConfig: { maxRetries: 0 },
    });
  }
  return graphQLClient;
}

async function queryGitHub(
  query: string,
  variables: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<unknown> {
  const client = getGitHubGraphQLClient();
  return retryGitHubOperation(
    async () => {
      try {
        return await client.query(query, variables, signal ? AbortSignal.any([signal]) : undefined);
      } catch (error) {
        signal?.throwIfAborted();
        if (!(error instanceof Error)) throw error;
        const causeCode =
          error.cause instanceof Error && "code" in error.cause ? error.cause.code : undefined;
        if (
          /^Request timeout after \d+ms:/.test(error.message) ||
          causeCode === "UND_ERR_CONNECT_TIMEOUT" ||
          causeCode === "UND_ERR_HEADERS_TIMEOUT" ||
          causeCode === "UND_ERR_BODY_TIMEOUT" ||
          causeCode === "ETIMEDOUT"
        ) {
          throw new GitHubUpstreamUnavailableError("upstream-timeout", error);
        }
        if (error.message === "GraphQL HTTP error! status: 429") {
          throw new GitHubUpstreamUnavailableError("upstream-rate-limit", error);
        }
        if (error.message === "GraphQL HTTP error! status: 503") {
          throw new GitHubUpstreamUnavailableError("upstream-unavailable", error);
        }
        throw error;
      }
    },
    {
      ...GITHUB_ACTIVITY_UPSTREAM_RETRY,
      isRetryable: (error) =>
        error instanceof GitHubUpstreamUnavailableError ||
        (!(error instanceof GraphQLError) &&
          !(error instanceof Error && error.message.startsWith("GraphQL HTTP error! status:")) &&
          RETRY_CONFIGS.HTTP_CLIENT.isRetryable(error)),
    },
    signal,
  );
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
export async function fetchContributedRepositories(
  username: string,
  signal?: AbortSignal,
): Promise<{
  userId: string;
  repositories: GraphQLRepoNode[];
}> {
  const repositories = new Map<string, GraphQLRepoNode>();
  let cursor: string | null = null;
  let userId: string;
  do {
    await waitForGitHubPermit("github-graphql", "contributed-repos", signal);
    const rawResponse = await queryGitHub(
      `
    query($username: String!, $cursor: String) {
      user(login: $username) {
        id
        repositoriesContributedTo(
          first: 100,
          after: $cursor,
          contributionTypes: [COMMIT],
          includeUserRepositories: true,
          orderBy: { field: PUSHED_AT, direction: DESC }
        ) {
          nodes { id name owner { login } nameWithOwner isFork isPrivate }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
    `,
      { username, cursor },
      signal,
    );

    const response = GitHubGraphQLContributionResponseSchema.parse(rawResponse);
    const { user } = response;

    if (!user?.id) {
      throw new Error(`Failed to fetch user ID for ${username}`);
    }

    userId = user.id;
    for (const repo of user.repositoriesContributedTo.nodes) {
      if (!repo.isFork) repositories.set(repo.id, repo);
    }
    const { hasNextPage, endCursor } = user.repositoriesContributedTo.pageInfo;
    if (hasNextPage && (!endCursor || endCursor === cursor)) {
      throw new Error("GitHub repository pagination did not advance");
    }
    cursor = hasNextPage ? endCursor : null;
  } while (cursor);

  return { userId, repositories: [...repositories.values()] };
}

/** Discover every contribution year, independently of repository visibility. */
export async function fetchContributionYears(
  username: string,
  signal?: AbortSignal,
): Promise<number[]> {
  await waitForGitHubPermit("github-graphql", "contribution-years", signal);
  const response = await queryGitHub(
    `query($username: String!) {
      user(login: $username) { contributionsCollection { contributionYears } }
    }`,
    { username },
    signal,
  );
  return GraphQLContributionYearsResponseSchema.parse(response).user.contributionsCollection
    .contributionYears;
}

/**
 * Fetch contribution calendar data
 */
export async function fetchContributionCalendar(
  username: string,
  from?: string,
  to?: string,
  signal?: AbortSignal,
): Promise<GraphQLUserContributionsResponse> {
  await waitForGitHubPermit("github-graphql", "contribution-calendar", signal);

  const rawResponse = await queryGitHub(
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
    signal,
  );

  return GraphQLUserContributionsResponseSchema.parse(rawResponse);
}

/**
 * Fetch contributor stats from REST API
 */
export async function fetchContributorStats(
  owner: string,
  name: string,
  signal?: AbortSignal,
): Promise<GithubContributorStatsEntry[]> {
  const maxAttempts = Number(process.env.GITHUB_STATS_PENDING_MAX_ATTEMPTS ?? "4");
  const initialDelayMs = Number(process.env.GITHUB_STATS_PENDING_DELAY_MS ?? "10000"); // 10s default

  let attempt = 0;
  let currentDelay = initialDelayMs;

  while (attempt < maxAttempts) {
    attempt++;
    await waitForGitHubPermit("github-rest", "contributor-stats", signal);

    const url = `https://api.github.com/repos/${owner}/${name}/stats/contributors`;
    const response = await githubHttpClient(url, {
      signal,
      headers: {
        Authorization: `token ${GITHUB_API_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    // Explicitly detect HTTP 202 – GitHub is preparing the statistics.
    if (response.status === HTTP_ACCEPTED) {
      // If we have more attempts remaining, wait and retry; otherwise propagate pending error.
      if (attempt < maxAttempts) {
        debugLog(
          `GitHub contributor stats still pending for ${owner}/${name} (attempt ${attempt}/${maxAttempts}). Retrying in ${currentDelay}ms`,
          "info",
        );
        await waitForGitHubRetry(currentDelay, signal);
        currentDelay *= 2; // exponential back-off
        continue;
      }
      throw new GitHubContributorStatsPendingError(
        `Contributor stats for ${owner}/${name} are still generating on GitHub (HTTP 202) after ${maxAttempts} attempts.`,
      );
    }

    if (response.status === HTTP_NO_CONTENT) {
      return [];
    }

    if (response.status === HTTP_FORBIDDEN) {
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
 * Fetch with advanced retry logic for critical operations
 * Similar to opengraph/fetch.ts but tailored for GitHub API
 */
export async function fetchWithAdvancedRetry<T>(
  operation: () => Promise<T>,
  context: string,
): Promise<Result<T>> {
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
