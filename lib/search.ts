/**
 * Search Utilities
 */

import { posts } from "../data/blog/posts";
import { certifications, education } from "../data/education";
import { experiences } from "../data/experience";
import { investments } from "../data/investments";
import type { BlogPost } from "../types/blog";
import type { SearchResult, EducationItem, BookmarkIndexItem } from "../types/search";
import MiniSearch from "minisearch";
import { ServerCacheInstance } from "./server-cache";
import { sanitizeSearchQuery } from "./validators/search";
import { prepareDocumentsForIndexing } from "./utils/search-helpers";

// --- MiniSearch Index Management ---

// Cache keys for MiniSearch indexes
const SEARCH_INDEX_KEYS = {
  POSTS: "search:index:posts",
  INVESTMENTS: "search:index:investments",
  EXPERIENCE: "search:index:experience",
  EDUCATION: "search:index:education",
  BOOKMARKS: "search:index:bookmarks",
} as const;

// TTL for search indexes (1 hour for static, 5 minutes for dynamic)
const STATIC_INDEX_TTL = 60 * 60; // 1 hour in seconds
const BOOKMARK_INDEX_TTL = 5 * 60; // 5 minutes in seconds

/**
 * Generic search function that filters items based on a query.
 * Uses MiniSearch for fuzzy matching when available, falls back to substring search.
 *
 * @param items - Array of items to search
 * @param query - Search query string
 * @param getSearchableFields - Function to extract searchable text from an item
 * @param getExactMatchField - Optional function to get field for exact matching
 * @param miniSearchIndex - Optional pre-built MiniSearch index
 * @returns Filtered array of items matching the query
 */
function searchContent<T>(
  items: T[],
  query: string,
  getSearchableFields: (item: T) => (string | undefined | null)[],
  getExactMatchField?: (item: T) => string,
  miniSearchIndex?: MiniSearch<T> | null,
): T[] {
  // Sanitize the query first
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) return items;

  // If we have a MiniSearch index, use it for fuzzy search
  if (miniSearchIndex) {
    try {
      const searchResults = miniSearchIndex.search(sanitizedQuery, {
        prefix: true, // Allow prefix matching for autocomplete-like behavior
        fuzzy: 0.1, // Allow minimal typos (10% edit distance)
        boost: {
          // Boost exact matches
          exactMatch: 2,
        },
        combineWith: "AND", // All terms must match
      });

      // Map search results back to original items
      const resultIds = new Set(searchResults.map((r) => String(r.id)));
      return items.filter((item) => {
        const itemWithId = item as T & { id?: string | number };
        const itemId = String(itemWithId.id ?? item);
        return resultIds.has(itemId);
      });
    } catch (error) {
      console.warn("[Search] MiniSearch failed, falling back to substring search:", error);
      // Fall through to substring search
    }
  }

  // Fallback: Original substring search implementation
  const searchTerms = sanitizedQuery.split(/\s+/).filter(Boolean);

  return items.filter((item) => {
    // First try exact match if exact match field is provided
    if (getExactMatchField) {
      const exactField = getExactMatchField(item);
      if (exactField.toLowerCase() === sanitizedQuery) {
        return true;
      }
    }

    // Combine all searchable fields into one long string for better matching
    const allContentText = getSearchableFields(item)
      .filter((field): field is string => typeof field === "string" && field.length > 0)
      .join(" ")
      .toLowerCase();

    // Check if all search terms exist in the combined text
    return searchTerms.every((term) => allContentText.includes(term));
  });
}

// --- Helper functions to create MiniSearch indexes ---

function getPostsIndex(): MiniSearch<BlogPost> {
  // Try to get from cache first
  const cached = ServerCacheInstance.get<MiniSearch<BlogPost>>(SEARCH_INDEX_KEYS.POSTS);
  if (cached) {
    return cached;
  }

  // Create new index
  const postsIndex = new MiniSearch<BlogPost>({
    fields: ["title", "excerpt", "tags", "authorName"], // Fields to index
    storeFields: ["id", "title", "excerpt", "slug", "publishedAt"], // Fields to return with results
    idField: "slug", // Unique identifier
    searchOptions: {
      boost: { title: 2 }, // Title matches are more important
      fuzzy: 0.1,
      prefix: true,
    },
    extractField: (document, fieldName) => {
      // Handle virtual fields and array conversions
      if (fieldName === "authorName") {
        return document.author?.name || "";
      }
      if (fieldName === "tags") {
        return Array.isArray(document.tags) ? document.tags.join(" ") : "";
      }
      // Default field extraction
      const field = fieldName as keyof BlogPost;
      const value = document[field];
      return typeof value === "string" ? value : "";
    },
  });

  // Deduplicate posts by slug before adding to index
  const dedupedPosts = prepareDocumentsForIndexing(posts, "Blog Posts", (post) => post.slug);

  // Add posts directly - virtual fields are handled by extractField
  postsIndex.addAll(dedupedPosts);

  // Cache the index
  ServerCacheInstance.set(SEARCH_INDEX_KEYS.POSTS, postsIndex, STATIC_INDEX_TTL);

  return postsIndex;
}

export function searchPosts(query: string): BlogPost[] {
  // Check cache first
  const cached = ServerCacheInstance.getSearchResults<BlogPost>("posts", query);
  if (cached && !ServerCacheInstance.shouldRefreshSearch("posts", query)) {
    return cached.results;
  }

  const results = searchContent(
    posts,
    query,
    (post) => [post.title || "", post.excerpt || "", ...(post.tags || []), post.author?.name || ""],
    (post) => post.title,
    getPostsIndex(),
  );

  const sortedResults = results.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  // Cache the results
  ServerCacheInstance.setSearchResults("posts", query, sortedResults);

  return sortedResults;
}

function getInvestmentsIndex(): MiniSearch<(typeof investments)[0]> {
  // Try to get from cache first
  const cached = ServerCacheInstance.get<MiniSearch<(typeof investments)[0]>>(SEARCH_INDEX_KEYS.INVESTMENTS);
  if (cached) {
    return cached;
  }

  // Create new index
  const investmentsIndex = new MiniSearch<(typeof investments)[0]>({
    fields: [
      "name",
      "description",
      "type",
      "status",
      "founded_year",
      "invested_year",
      "acquired_year",
      "shutdown_year",
    ],
    storeFields: ["id", "name", "description"],
    idField: "id",
    searchOptions: {
      boost: { name: 2 },
      fuzzy: 0.1,
      prefix: true,
    },
  });

  // Deduplicate investments by id before adding to index
  const dedupedInvestments = prepareDocumentsForIndexing(investments, "Investments");
  investmentsIndex.addAll(dedupedInvestments);

  // Cache the index
  ServerCacheInstance.set(SEARCH_INDEX_KEYS.INVESTMENTS, investmentsIndex, STATIC_INDEX_TTL);

  return investmentsIndex;
}

export function searchInvestments(query: string): SearchResult[] {
  // Check cache first
  const cached = ServerCacheInstance.getSearchResults<SearchResult>("investments", query);
  if (cached && !ServerCacheInstance.shouldRefreshSearch("investments", query)) {
    return cached.results;
  }

  const results = searchContent(
    investments,
    query,
    (inv) => [
      inv.name,
      inv.description,
      inv.type,
      inv.status,
      inv.founded_year,
      inv.invested_year,
      inv.acquired_year,
      inv.shutdown_year,
    ],
    (inv) => inv.name,
    getInvestmentsIndex(),
  );

  const searchResults: SearchResult[] = results.map((inv) => ({
    id: inv.id,
    type: "project",
    title: inv.name,
    description: inv.description,
    url: `/investments#${inv.id}`,
    score: 0,
  }));

  // Cache the results
  ServerCacheInstance.setSearchResults("investments", query, searchResults);

  return searchResults;
}

function getExperienceIndex(): MiniSearch<(typeof experiences)[0]> {
  // Try to get from cache first
  const cached = ServerCacheInstance.get<MiniSearch<(typeof experiences)[0]>>(SEARCH_INDEX_KEYS.EXPERIENCE);
  if (cached) {
    return cached;
  }

  // Create new index
  const experienceIndex = new MiniSearch<(typeof experiences)[0]>({
    fields: ["company", "role", "period"],
    storeFields: ["id", "company", "role"],
    idField: "id",
    searchOptions: {
      boost: { company: 2, role: 1.5 },
      fuzzy: 0.2,
      prefix: true,
    },
  });

  // Deduplicate experiences by id before adding to index
  const dedupedExperiences = prepareDocumentsForIndexing(experiences, "Experience");
  experienceIndex.addAll(dedupedExperiences);

  // Cache the index
  ServerCacheInstance.set(SEARCH_INDEX_KEYS.EXPERIENCE, experienceIndex, STATIC_INDEX_TTL);

  return experienceIndex;
}

export function searchExperience(query: string): SearchResult[] {
  // Check cache first
  const cached = ServerCacheInstance.getSearchResults<SearchResult>("experience", query);
  if (cached && !ServerCacheInstance.shouldRefreshSearch("experience", query)) {
    return cached.results;
  }

  const results = searchContent(
    experiences,
    query,
    (exp) => [exp.company, exp.role, exp.period],
    (exp) => exp.company,
    getExperienceIndex(),
  );

  const searchResults: SearchResult[] = results.map((exp) => ({
    id: exp.id,
    type: "project",
    title: exp.company,
    description: exp.role,
    url: `/experience#${exp.id}`,
    score: 0,
  }));

  // Cache the results
  ServerCacheInstance.setSearchResults("experience", query, searchResults);

  return searchResults;
}

function getEducationIndex(): MiniSearch<EducationItem> {
  // Try to get from cache first
  const cached = ServerCacheInstance.get<MiniSearch<EducationItem>>(SEARCH_INDEX_KEYS.EDUCATION);
  if (cached) {
    return cached;
  }

  // Create new index
  const educationIndex = new MiniSearch<EducationItem>({
    fields: ["label", "description"],
    storeFields: ["id", "label", "description", "path"],
    idField: "id",
    searchOptions: {
      boost: { label: 2 },
      fuzzy: 0.2,
      prefix: true,
    },
  });

  // Combine education and certifications
  const allEducationItems = [
    ...education.map((edu) => ({
      id: edu.id,
      label: edu.institution,
      description: edu.degree,
      path: `/education#${edu.id}`,
    })),
    ...certifications.map((cert) => ({
      id: cert.id,
      label: cert.institution,
      description: cert.name,
      path: `/education#${cert.id}`,
    })),
  ];

  // Deduplicate education items by id before adding to index
  const dedupedEducationItems = prepareDocumentsForIndexing(allEducationItems, "Education");
  educationIndex.addAll(dedupedEducationItems);

  // Cache the index
  ServerCacheInstance.set(SEARCH_INDEX_KEYS.EDUCATION, educationIndex, STATIC_INDEX_TTL);

  return educationIndex;
}

export function searchEducation(query: string): SearchResult[] {
  // Check cache first
  const cached = ServerCacheInstance.getSearchResults<SearchResult>("education", query);
  if (cached && !ServerCacheInstance.shouldRefreshSearch("education", query)) {
    return cached.results;
  }

  const allItems = [
    ...education.map((edu) => ({
      id: edu.id,
      label: edu.institution,
      description: edu.degree,
      path: `/education#${edu.id}`,
      searchableText: [edu.institution, edu.degree], // For search
    })),
    ...certifications.map((cert) => ({
      id: cert.id,
      label: cert.institution,
      description: cert.name,
      path: `/education#${cert.id}`,
      searchableText: [cert.institution, cert.name], // For search
    })),
  ];

  const results = searchContent(
    allItems,
    query,
    (item) => item.searchableText,
    (item) => item.label, // Exact match on institution
    getEducationIndex(),
  );

  // Remove the temporary searchableText field
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const searchResults: SearchResult[] = results.map(({ searchableText: _searchableText, ...item }) => ({
    id: item.id,
    type: "page",
    title: item.label,
    description: item.description,
    url: item.path,
    score: 0,
  }));

  // Cache the results
  ServerCacheInstance.setSearchResults("education", query, searchResults);

  return searchResults;
}

// Helper function to get or create bookmarks index
async function getBookmarksIndex(): Promise<{ index: MiniSearch<BookmarkIndexItem>; bookmarks: Array<BookmarkIndexItem & { slug: string }> }> {
  // Try to get from cache first
  const cacheKey = SEARCH_INDEX_KEYS.BOOKMARKS;
  const cached = ServerCacheInstance.get<{ index: MiniSearch<BookmarkIndexItem>; bookmarks: Array<BookmarkIndexItem & { slug: string }> }>(cacheKey);
  if (cached) {
    return cached;
  }

  // Fetch bookmark data via the API
  const { getBaseUrl } = await import("@/lib/utils/get-base-url");
  const apiUrl = `${getBaseUrl()}/api/bookmarks`;

  // Abort the request if it hangs >5 s
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  let resp: Response;
  try {
    resp = await fetch(apiUrl, { cache: "no-store", signal: controller.signal });
  } catch (fetchErr) {
    clearTimeout(timeoutId);
    throw fetchErr;
  }
  clearTimeout(timeoutId);

  if (!resp.ok) {
    throw new Error(`Failed to fetch bookmarks: ${resp.status}`);
  }

  // Parse response
  const raw = (await resp.json()) as unknown;
  let bookmarksData: unknown;
  if (Array.isArray(raw)) {
    bookmarksData = raw;
  } else if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    bookmarksData = obj.data ?? obj.bookmarks ?? [];
  } else {
    bookmarksData = [];
  }

  const bookmarks = (Array.isArray(bookmarksData) ? bookmarksData : []) as Array<{
    id: string;
    url: string;
    title: string;
    description: string;
    tags?: Array<string | { name?: string }>;
    content?: { author?: string | null; publisher?: string | null };
  }>;

  // Generate slugs
  const { generateUniqueSlug } = await import("@/lib/utils/domain-utils");
  
  // Create MiniSearch index
  const bookmarksIndex = new MiniSearch<BookmarkIndexItem>({
    fields: ["title", "description", "tags", "author", "publisher", "url"],
    storeFields: ["id", "title", "description", "url"],
    idField: "id",
    searchOptions: {
      boost: { title: 2, description: 1.5 },
      fuzzy: 0.2,
      prefix: true,
    },
  });

  // Transform bookmarks for indexing
  const bookmarksForIndex: Array<BookmarkIndexItem & { slug: string }> = bookmarks.map((b) => ({
    id: b.id,
    title: b.title || b.url,
    description: b.description || "",
    tags: Array.isArray(b.tags) ? b.tags.map((t) => (typeof t === "string" ? t : t?.name || "")).join(" ") : "",
    url: b.url,
    author: b.content?.author || "",
    publisher: b.content?.publisher || "",
    slug: generateUniqueSlug(b.url, bookmarks, b.id),
  }));

  // Add to index
  bookmarksIndex.addAll(bookmarksForIndex);

  // Cache the index and bookmarks
  const result = { index: bookmarksIndex, bookmarks: bookmarksForIndex };
  ServerCacheInstance.set(cacheKey, result, BOOKMARK_INDEX_TTL);

  return result;
}

export async function searchBookmarks(query: string): Promise<SearchResult[]> {
  try {
    // Check result cache first
    const cached = ServerCacheInstance.getSearchResults<SearchResult>("bookmarks", query);
    if (cached && !ServerCacheInstance.shouldRefreshSearch("bookmarks", query)) {
      return cached.results;
    }

    // Get bookmarks index
    let indexData: { index: MiniSearch<BookmarkIndexItem>; bookmarks: Array<BookmarkIndexItem & { slug: string }> };
    try {
      indexData = await getBookmarksIndex();
    } catch (error) {
      console.error(`[searchBookmarks] Failed to get bookmarks index:`, error);
      return cached?.results || [];
    }

    const { index, bookmarks } = indexData;

    // No query? Return all bookmarks
    if (!query) {
      const results = bookmarks.map(
        (b) =>
          ({
            id: b.id,
            type: "bookmark",
            title: b.title,
            description: b.description,
            url: `/bookmarks/${b.slug}`,
            score: 0,
          }) as SearchResult,
      );
      return results;
    }

    // Use MiniSearch for querying
    const sanitizedQuery = sanitizeSearchQuery(query);
    if (!sanitizedQuery) return [];

    const searchResults = index.search(sanitizedQuery, {
      prefix: true,
      fuzzy: 0.2,
      boost: { title: 2, description: 1.5 },
      combineWith: "AND",
    });

    // Map search results back to SearchResult format
    const resultIds = new Set(searchResults.map((r) => String(r.id)));
    const results = bookmarks
      .filter((b) => resultIds.has(b.id))
      .map(
        (b) =>
          ({
            id: b.id,
            type: "bookmark",
            title: b.title,
            description: b.description,
            url: `/bookmarks/${b.slug}`,
            score: searchResults.find((r) => r.id === b.id)?.score || 0,
          }) as SearchResult,
      )
      .sort((a, b) => b.score - a.score);

    // Cache the results
    ServerCacheInstance.setSearchResults("bookmarks", query, results);
    
    return results;
  } catch (err) {
    console.error("[searchBookmarks] Unexpected failure:", err);
    // Return cached results if available on error
    const cached = ServerCacheInstance.getSearchResults<SearchResult>("bookmarks", query);
    return cached?.results || [];
  }
}
