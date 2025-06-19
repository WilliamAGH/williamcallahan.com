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
export async function handleBookmarkApiResponse(response: Response, context: string): Promise<UnifiedBookmark[]> {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request ${context} failed with status ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as UnifiedBookmark[] | { bookmarks?: UnifiedBookmark[] };

  // Handle both array and object response formats
  if (Array.isArray(data)) {
    return data;
  }
  if (data && Array.isArray(data.bookmarks)) {
    return data.bookmarks;
  }

  console.warn(`${getLogPrefix()} Received non-standard data from ${context}, returning empty array.`);
  return [];
}

/**
 * Makes a request to the bookmarks API endpoint
 */
export async function callBookmarksApi(endpoint: string, options?: RequestInit): Promise<UnifiedBookmark[]> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${endpoint}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
      ...options,
    });

    return handleBookmarkApiResponse(response, endpoint);
  } catch (error) {
    console.error(`${getLogPrefix()} Failed to fetch from ${endpoint}:`, error);
    throw error;
  }
}
