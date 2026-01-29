/**
 * Shared API client utilities for bookmarks
 * @module lib/bookmarks/api-client
 */

import { getBaseUrl } from "@/lib/utils/get-base-url";
import type { UnifiedBookmark } from "@/types";

/**
 * Generates a consistent log prefix for bookmark operations
 * @param operation - The operation being performed
 * @returns Formatted log prefix
 */
export function getLogPrefix(operation?: string): string {
  const base = "[Bookmarks]";
  return operation ? `${base} [${operation}]` : base;
}

/**
 * Standard response handler for bookmark API calls
 */
export async function handleBookmarkApiResponse(
  response: Response,
  context: string,
): Promise<UnifiedBookmark[]> {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request ${context} failed with status ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as
    | UnifiedBookmark[]
    | { bookmarks?: UnifiedBookmark[]; data?: UnifiedBookmark[] };

  // Handle both array and object response formats
  if (Array.isArray(data)) {
    return data;
  }
  if (data && Array.isArray(data.data)) {
    return data.data;
  }
  if (data && Array.isArray(data.bookmarks)) {
    return data.bookmarks;
  }

  console.warn(
    `${getLogPrefix()} Received non-standard data from ${context}, returning empty array.`,
  );
  return [];
}

/**
 * Makes a request to the bookmarks API endpoint
 */
export async function callBookmarksApi(
  endpoint: string,
  options?: RequestInit,
): Promise<UnifiedBookmark[]> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${endpoint}`;

  // Add timeout using AbortController
  const controller = new AbortController();
  const timeoutMs = 30000; // 30 seconds timeout
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
      ...options,
    });

    clearTimeout(timeout);
    return handleBookmarkApiResponse(response, endpoint);
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      console.error(`${getLogPrefix()} Request to ${endpoint} timed out after ${timeoutMs}ms`);
      throw new Error(`Request timed out after ${timeoutMs}ms`, { cause: error });
    }
    console.error(`${getLogPrefix()} Failed to fetch from ${endpoint}:`, error);
    throw error;
  }
}
