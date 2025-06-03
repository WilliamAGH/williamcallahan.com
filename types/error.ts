/**
 * Error Type Definitions
 *
 * Defines standard error types and interfaces used throughout the application
 * for consistent error handling and type safety.
 */

/**
 * Extended Error interface for application-specific errors
 */
export interface ExtendedError extends Error {
  /** Timestamp of when the data was last successfully fetched */
  lastFetched?: number;
  /** Timestamp of the last fetch attempt */
  lastFetchedTimestamp?: number;
  /** Error code for categorizing the error type */
  code?: string;
  /** Additional context data for the error */
  context?: Record<string, unknown>;
}

/**
 * Error interface specifically for bookmark-related errors
 */
export interface BookmarkError extends ExtendedError {
  /** Timestamp of when bookmarks were last successfully fetched */
  lastFetched?: number;
  /** Timestamp of the last bookmark fetch attempt */
  lastFetchedTimestamp?: number;
}

/**
 * Error interface for GitHub activity related errors
 */
export interface GitHubActivityError extends ExtendedError {
  /** Timestamp of when GitHub activity was last successfully fetched */
  lastActivityFetch?: number;
}

/**
 * Type guard to check if an error has the lastFetched property
 */
export function hasLastFetched(error: unknown): error is ExtendedError & { lastFetched: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'lastFetched' in error &&
    typeof (error as ExtendedError).lastFetched === 'number'
  );
}

/**
 * Type guard to check if an error has the lastFetchedTimestamp property
 */
export function hasLastFetchedTimestamp(error: unknown): error is ExtendedError & { lastFetchedTimestamp: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'lastFetchedTimestamp' in error &&
    typeof (error as ExtendedError).lastFetchedTimestamp === 'number'
  );
}

/**
 * Utility function to safely extract error message
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}

/**
 * Utility function to safely extract timestamp from error
 */
export function getErrorTimestamp(error: unknown, property: 'lastFetched' | 'lastFetchedTimestamp'): number | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    property in error &&
    typeof (error as Record<string, unknown>)[property] === 'number'
  ) {
    return (error as Record<string, number>)[property];
  }
  return undefined;
}