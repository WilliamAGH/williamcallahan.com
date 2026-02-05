/**
 * Search Helper Utilities
 *
 * Utility functions for search functionality including deduplication,
 * data normalization, request coalescing, and result transformation
 *
 * @module utils/search-helpers
 */

import type { SearchResult } from "@/types/search";
import type { TerminalSearchResult } from "@/types/terminal";

/**
 * In-flight search request map for request coalescing.
 * Prevents duplicate concurrent API calls for the same search key.
 * Key format: "scope:query" for scoped searches or just "query" for site-wide.
 */
const inFlightSearches = new Map<string, Promise<unknown>>();

/**
 * Coalesces concurrent search requests with the same key.
 * If a search with the same key is already in-flight, returns the existing promise.
 * Otherwise, executes the search function and caches the promise until completion.
 *
 * @template T - The return type of the search function
 * @param key - Unique key for this search (e.g., "blog:typescript" or "all:react")
 * @param searchFn - Async function that performs the actual search
 * @returns Promise resolving to search results
 *
 * @example
 * // For scoped search
 * const results = await coalesceSearchRequest(
 *   `${scope}:${query}`,
 *   () => searchBlogPostsServerSide(query)
 * );
 *
 * @example
 * // For site-wide search
 * const results = await coalesceSearchRequest(
 *   `all:${query}`,
 *   () => performSiteWideSearch(query)
 * );
 */
export async function coalesceSearchRequest<T>(
  key: string,
  searchFn: () => Promise<T>,
): Promise<T> {
  // Check for existing in-flight search
  const existing = inFlightSearches.get(key);
  if (existing) {
    console.log(`[Search] Reusing in-flight search for key: "${key}"`);
    return existing as Promise<T>;
  }

  // Create new search promise with cleanup
  const searchPromise = (async () => {
    try {
      return await searchFn();
    } finally {
      // Always clean up after completion
      inFlightSearches.delete(key);
    }
  })();

  // Store for coalescing
  inFlightSearches.set(key, searchPromise);

  return searchPromise;
}

/**
 * Transforms a SearchResult (API format) to TerminalSearchResult (terminal display format).
 * Centralizes the mapping between API response format and terminal UI format.
 *
 * @param result - The SearchResult from the search API
 * @returns TerminalSearchResult suitable for terminal display
 *
 * @example
 * const searchResults = await fetch('/api/search/all?q=react').then(r => r.json());
 * const terminalResults = searchResults.map(transformSearchResultToTerminalResult);
 */
export function transformSearchResultToTerminalResult(result: SearchResult): TerminalSearchResult {
  // Ensure we have a valid ID - SearchResult.id is required by the interface
  const id = result.id;
  if (!id) {
    console.warn(
      "[Search] Search result is missing a stable ID. This may cause rendering issues.",
      result,
    );
    // Generate a fallback ID if somehow missing
    return {
      id: crypto.randomUUID(),
      label: result.title || "Untitled",
      description: result.description || "",
      path: result.url || "#",
    };
  }

  return {
    id: `${result.type}-${id}`,
    label: result.title || "Untitled",
    description: result.description || "",
    path: result.url || "#",
  };
}

/**
 * Deduplicates an array of documents by a unique identifier field
 *
 * @template T - Document type that must have an id property
 * @param documents - Array of documents to deduplicate
 * @param getIdField - Function to extract the ID field from a document (defaults to doc.id)
 * @returns Array of deduplicated documents (first occurrence kept)
 *
 * @example
 * const docs = [
 *   { id: '1', title: 'First' },
 *   { id: '2', title: 'Second' },
 *   { id: '1', title: 'Duplicate' }
 * ];
 * const deduped = dedupeDocuments(docs); // Returns first two items
 *
 * @example
 * // Custom ID field extraction
 * const posts = [
 *   { slug: 'post-1', title: 'First Post' },
 *   { slug: 'post-2', title: 'Second Post' },
 *   { slug: 'post-1', title: 'Duplicate Post' }
 * ];
 * const deduped = dedupeDocuments(posts, (post) => post.slug);
 */
export function dedupeDocuments<T extends { id?: string | number }>(
  documents: T[],
  getIdField: (doc: T) => string = (doc) => String(doc.id ?? ""),
): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  const duplicates: string[] = [];

  for (const doc of documents) {
    const id = getIdField(doc);

    if (!id) {
      console.warn("[Search] Document with missing ID detected and skipped");
      continue;
    }

    if (!seen.has(id)) {
      seen.add(id);
      deduped.push(doc);
    } else {
      duplicates.push(id);
    }
  }

  if (duplicates.length > 0) {
    console.warn(
      `[Search] ${duplicates.length} duplicate ID(s) detected and skipped:`,
      duplicates.slice(0, 10).join(", "),
      duplicates.length > 10 ? `... and ${duplicates.length - 10} more` : "",
    );
  }

  return deduped;
}

/**
 * Validates and deduplicates documents before indexing
 * Logs statistics about the deduplication process
 *
 * @template T - Document type
 * @param documents - Array of documents to process
 * @param sourceName - Name of the data source for logging
 * @param getIdField - Function to extract the ID field
 * @returns Deduplicated array of documents
 */
export function prepareDocumentsForIndexing<T extends { id?: string | number }>(
  documents: T[],
  sourceName: string,
  getIdField?: (doc: T) => string,
): T[] {
  const originalCount = documents.length;
  const deduped = dedupeDocuments(documents, getIdField);
  const dedupedCount = deduped.length;

  if (originalCount !== dedupedCount) {
    console.log(
      `[Search] ${sourceName}: Deduplicated ${originalCount} documents to ${dedupedCount} (removed ${originalCount - dedupedCount} duplicates)`,
    );
  }

  return deduped;
}
