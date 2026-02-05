/**
 * Shared GraphQL Client Utilities
 *
 * Generic GraphQL client that leverages existing HTTP client and retry utilities
 * Supports authenticated requests, custom headers, and automatic retries
 *
 * @module lib/utils/graphql-client
 */

import { fetchJson, createRetryingFetch } from "./http-client";
import { debugLog } from "./debug";
import type { FetchOptions } from "@/types/http";
import type { GraphQLRequest, GraphQLResponse, GraphQLClientConfig } from "@/types/graphql";

/**
 * GraphQL Client class for making authenticated GraphQL requests
 */
export class GraphQLClient {
  private config: Required<GraphQLClientConfig>;
  private retryingFetch: typeof fetchJson;

  constructor(config: GraphQLClientConfig) {
    this.config = {
      endpoint: config.endpoint,
      headers: config.headers || {},
      timeout: config.timeout || 30000,
      maxRetries: config.maxRetries || 3,
      retryConfig: config.retryConfig || {},
      debug: config.debug || false,
    };

    // Create a retrying fetch function
    const retryingHttpFetch = createRetryingFetch(
      this.config.maxRetries,
      1000,
      this.config.retryConfig,
    );

    // Wrap it to return JSON - callers must validate response structure
    this.retryingFetch = async <T>(url: string, options?: FetchOptions): Promise<T> => {
      const response = await retryingHttpFetch(url, options);
      if (!response.ok) {
        throw new Error(`GraphQL HTTP error! status: ${response.status}`);
      }
      // GraphQL responses follow a standard structure validated by GraphQLResponse<T>
      const json: unknown = await response.json();
      return json as T;
    };
  }

  /**
   * Execute a GraphQL query/mutation
   */
  async request<T = unknown>(request: GraphQLRequest): Promise<GraphQLResponse<T>> {
    const { query, variables, operationName } = request;

    if (this.config.debug) {
      debugLog(`GraphQL Request to ${this.config.endpoint}`, "info", { operationName, variables });
    }

    try {
      const response = await this.retryingFetch<GraphQLResponse<T>>(this.config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.config.headers,
        },
        body: JSON.stringify({
          query,
          variables,
          operationName,
        }),
        timeout: this.config.timeout,
      });

      if (response.errors && response.errors.length > 0) {
        const errorMessages = response.errors.map((e) => e.message).join(", ");

        if (this.config.debug) {
          debugLog("GraphQL Errors", "error", { errors: response.errors });
        }

        throw new GraphQLError(`GraphQL errors: ${errorMessages}`, response.errors);
      }

      return response;
    } catch (error) {
      if (this.config.debug) {
        debugLog("GraphQL Request Failed", "error", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  }

  /**
   * Execute a GraphQL query
   */
  async query<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await this.request<T>({ query, variables });
    if (!response.data) {
      throw new Error("No data returned from GraphQL query");
    }
    return response.data;
  }

  /**
   * Execute a GraphQL mutation
   */
  async mutate<T = unknown>(mutation: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await this.request<T>({
      query: mutation,
      variables,
    });
    if (!response.data) {
      throw new Error("No data returned from GraphQL mutation");
    }
    return response.data;
  }

  /**
   * Update client headers (e.g., for auth token refresh)
   */
  setHeaders(headers: Record<string, string>): void {
    this.config.headers = {
      ...this.config.headers,
      ...headers,
    };
  }
}

/**
 * Custom error class for GraphQL errors
 */
export class GraphQLError extends Error {
  constructor(
    message: string,
    public errors: NonNullable<GraphQLResponse["errors"]>,
  ) {
    super(message);
    this.name = "GraphQLError";
  }
}

/**
 * Create a one-off GraphQL request without creating a client instance
 * Useful for single requests or when you don't need a persistent client
 */
export async function graphqlRequest<T = unknown>(
  endpoint: string,
  query: string,
  variables?: Record<string, unknown>,
  options?: {
    headers?: Record<string, string>;
    timeout?: number;
    maxRetries?: number;
  },
): Promise<T> {
  const client = new GraphQLClient({
    endpoint,
    headers: options?.headers,
    timeout: options?.timeout,
    maxRetries: options?.maxRetries,
  });

  return client.query<T>(query, variables);
}

/**
 * GitHub-specific GraphQL client factory
 * Creates a pre-configured client for GitHub's GraphQL API
 */
export function createGitHubGraphQLClient(
  token: string,
  options?: Partial<GraphQLClientConfig>,
): GraphQLClient {
  return new GraphQLClient({
    endpoint: "https://api.github.com/graphql",
    headers: {
      Authorization: `bearer ${token}`,
      Accept: "application/vnd.github.v4+json",
      ...options?.headers,
    },
    timeout: 30000,
    maxRetries: 3,
    ...options,
  });
}

/**
 * Generic GraphQL client factory for any endpoint
 */
export function createGraphQLClient(
  endpoint: string,
  authToken?: string,
  options?: Partial<GraphQLClientConfig>,
): GraphQLClient {
  const headers: Record<string, string> = {
    ...options?.headers,
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  return new GraphQLClient({
    endpoint,
    headers,
    ...options,
  });
}
