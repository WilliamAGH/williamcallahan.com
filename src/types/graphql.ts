/**
 * GraphQL Client Type Definitions
 *
 * Types for the generic GraphQL client utility
 *
 * @module types/graphql
 */

import type { RetryConfig } from "./lib";

export interface GraphQLRequest {
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
}

export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: Array<string | number>;
    extensions?: Record<string, unknown>;
  }>;
}

export interface GraphQLClientConfig {
  endpoint: string;
  headers?: Record<string, string>;
  timeout?: number;
  maxRetries?: number;
  retryConfig?: Partial<RetryConfig>;
  debug?: boolean;
}
