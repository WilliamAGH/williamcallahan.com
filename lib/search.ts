/**
 * Search Utilities
 */

import { posts } from "../data/blog/posts";
import { certifications, education } from "../data/education";
import { experiences } from "../data/experience";
import { investments } from "../data/investments";
import { projects as projectsData } from "../data/projects";
import type { BlogPost } from "../types/blog";
import type { SearchResult, EducationItem, BookmarkIndexItem } from "../types/search";
import MiniSearch from "minisearch";
import { ServerCacheInstance } from "./server-cache";
import { sanitizeSearchQuery } from "./validators/search";
import { prepareDocumentsForIndexing } from "./utils/search-helpers";
import { USE_NEXTJS_CACHE, withCacheFallback } from "./cache";
import { unstable_cacheLife as cacheLife, unstable_cacheTag as cacheTag, revalidateTag } from "next/cache";
import { SEARCH_S3_PATHS } from "./constants";
import { readJsonS3 } from "./s3-utils";
import type { SerializedIndex } from "@/types/search";
import { loadIndexFromJSON } from "./search/index-builder";
import type { Project } from "../types/project";

// Add near top of file (after imports) a dev log helper
const IS_DEV = process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";
const devLog = (...args: unknown[]) => {
  if (IS_DEV) console.log("[SearchDev]", ...args);
};

// Type-safe wrappers for cache functions to fix ESLint unsafe call errors
const safeCacheLife = (
  profile:
    | "minutes"
    | "default"
    | "seconds"
    | "hours"
    | "days"
    | "weeks"
    | "max"
    | { stale?: number | undefined; revalidate?: number | undefined; expire?: number | undefined },
): void => {
  if (typeof cacheLife === "function") {
    cacheLife(profile);
  }
};
const safeCacheTag = (tag: string): void => {
  if (typeof cacheTag === "function") {
    cacheTag(tag);
  }
};
const safeRevalidateTag = (tag: string): void => {
  if (typeof revalidateTag === "function") {
    revalidateTag(tag);
  }
};

// --- MiniSearch Index Management ---

// Cache keys for MiniSearch indexes
const SEARCH_INDEX_KEYS = {
  POSTS: "search:index:posts",
  INVESTMENTS: "search:index:investments",
  EXPERIENCE: "search:index:experience",
  EDUCATION: "search:index:education",
  BOOKMARKS: "search:index:bookmarks",
  PROJECTS: "search:index:projects",
} as const;

// TTL for search indexes (1 hour for static, 5 minutes for dynamic)
const STATIC_INDEX_TTL = 60 * 60; // 1 hour in seconds
const BOOKMARK_INDEX_TTL = 5 * 60; // 5 minutes in seconds

// Flag to control whether to load indexes from S3 or build in-memory
const USE_S3_INDEXES = process.env.USE_S3_SEARCH_INDEXES === "true";

/**
 * Loads a search index from S3 if available, falls back to building in-memory
 * @param s3Path - S3 path to the serialized index
 * @param cacheKey - Cache key for storing the loaded index
 * @param buildFn - Function to build the index if S3 load fails
 * @param ttl - Cache TTL for the index
 * @returns The MiniSearch index
 */
async function loadOrBuildIndex<T>(
  s3Path: string,
  cacheKey: string,
  buildFn: () => MiniSearch<T>,
  ttl: number,
): Promise<MiniSearch<T>> {
  // Try to get from cache first
  const cached = ServerCacheInstance.get<MiniSearch<T>>(cacheKey);
  if (cached) {
    return cached;
  }

  let index: MiniSearch<T>;

  if (USE_S3_INDEXES) {
    try {
      // Try to load from S3
      const serializedIndex = await readJsonS3<SerializedIndex>(s3Path);
      if (serializedIndex?.index && serializedIndex.metadata) {
        index = loadIndexFromJSON<T>(serializedIndex);
        console.log(`[Search] Loaded ${cacheKey} from S3 (${serializedIndex.metadata.itemCount} items)`);
      } else {
        // Fall back to building in-memory
        console.warn(`[Search] Failed to load ${cacheKey} from S3, building in-memory`);
        index = buildFn();
      }
    } catch (error) {
      console.error(`[Search] Error loading ${cacheKey} from S3:`, error);
      // Fall back to building in-memory
      index = buildFn();
    }
  } else {
    // Build in-memory
    index = buildFn();
  }

  // Cache the index
  ServerCacheInstance.set(cacheKey, index, ttl);
  return index;
}

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

function buildPostsIndex(): MiniSearch<BlogPost> {
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

  return postsIndex;
}

async function getPostsIndex(): Promise<MiniSearch<BlogPost>> {
  return loadOrBuildIndex(SEARCH_S3_PATHS.POSTS_INDEX, SEARCH_INDEX_KEYS.POSTS, buildPostsIndex, STATIC_INDEX_TTL);
}

// Direct search function (always available)
async function searchPostsDirect(query: string): Promise<BlogPost[]> {
  const index = await getPostsIndex();
  const results = searchContent(
    posts,
    query,
    (post) => [post.title || "", post.excerpt || "", ...(post.tags || []), post.author?.name || ""],
    (post) => post.title,
    index,
  );

  return results.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

// Cached version using 'use cache' directive
async function searchPostsCached(query: string): Promise<BlogPost[]> {
  "use cache";

  safeCacheLife("minutes"); // 15 minute cache for search results
  safeCacheTag("search");
  safeCacheTag("posts-search");
  safeCacheTag(`search-posts-${query.slice(0, 20)}`); // Limit tag length

  return searchPostsDirect(query);
}

export async function searchPosts(query: string): Promise<BlogPost[]> {
  // Check legacy cache first
  const cached = ServerCacheInstance.getSearchResults<BlogPost>("posts", query);
  if (cached && !ServerCacheInstance.shouldRefreshSearch("posts", query)) {
    return cached.results;
  }

  const results = await searchPostsDirect(query);

  // Cache the results in legacy cache
  ServerCacheInstance.setSearchResults("posts", query, results);

  return results;
}

// Export async version for consumers that can use it
export async function searchPostsAsync(query: string): Promise<BlogPost[]> {
  if (USE_NEXTJS_CACHE) {
    return withCacheFallback(
      () => searchPostsCached(query),
      () => searchPostsDirect(query),
    );
  }

  // Fall back to regular search
  return searchPosts(query);
}

function buildInvestmentsIndex(): MiniSearch<(typeof investments)[0]> {
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

  return investmentsIndex;
}

async function getInvestmentsIndex(): Promise<MiniSearch<(typeof investments)[0]>> {
  return loadOrBuildIndex(
    SEARCH_S3_PATHS.INVESTMENTS_INDEX,
    SEARCH_INDEX_KEYS.INVESTMENTS,
    buildInvestmentsIndex,
    STATIC_INDEX_TTL,
  );
}

export async function searchInvestments(query: string): Promise<SearchResult[]> {
  // Check cache first
  const cached = ServerCacheInstance.getSearchResults<SearchResult>("investments", query);
  if (cached && !ServerCacheInstance.shouldRefreshSearch("investments", query)) {
    return cached.results;
  }

  const index = await getInvestmentsIndex();
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
    index,
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

function buildExperienceIndex(): MiniSearch<(typeof experiences)[0]> {
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

  return experienceIndex;
}

async function getExperienceIndex(): Promise<MiniSearch<(typeof experiences)[0]>> {
  return loadOrBuildIndex(
    SEARCH_S3_PATHS.EXPERIENCE_INDEX,
    SEARCH_INDEX_KEYS.EXPERIENCE,
    buildExperienceIndex,
    STATIC_INDEX_TTL,
  );
}

export async function searchExperience(query: string): Promise<SearchResult[]> {
  // Check cache first
  const cached = ServerCacheInstance.getSearchResults<SearchResult>("experience", query);
  if (cached && !ServerCacheInstance.shouldRefreshSearch("experience", query)) {
    return cached.results;
  }

  const index = await getExperienceIndex();
  const results = searchContent(
    experiences,
    query,
    (exp) => [exp.company, exp.role, exp.period],
    (exp) => exp.company,
    index,
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

function buildEducationIndex(): MiniSearch<EducationItem> {
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

  return educationIndex;
}

async function getEducationIndex(): Promise<MiniSearch<EducationItem>> {
  return loadOrBuildIndex(
    SEARCH_S3_PATHS.EDUCATION_INDEX,
    SEARCH_INDEX_KEYS.EDUCATION,
    buildEducationIndex,
    STATIC_INDEX_TTL,
  );
}

export async function searchEducation(query: string): Promise<SearchResult[]> {
  // Check cache first
  const cached = ServerCacheInstance.getSearchResults<SearchResult>("education", query);
  if (cached && !ServerCacheInstance.shouldRefreshSearch("education", query)) {
    return cached.results;
  }

  const index = await getEducationIndex();
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
    index,
  );

  // Remove the temporary searchableText field
  const searchResults: SearchResult[] = results.map((item) => ({
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
async function getBookmarksIndex(): Promise<{
  index: MiniSearch<BookmarkIndexItem>;
  bookmarks: Array<BookmarkIndexItem & { slug: string }>;
}> {
  // Memory safety guard – skip rebuild if under critical pressure
  try {
    const { getMemoryHealthMonitor } = await import("@/lib/health/memory-health-monitor");
    if (!getMemoryHealthMonitor().shouldAcceptNewRequests()) {
      throw new Error("Memory pressure – aborting bookmarks index build");
    }
  } catch {
    /* If monitor not available, continue */
  }

  devLog("[getBookmarksIndex] Building/Loading bookmarks index. start");
  // Try to get from cache first
  const cacheKey = SEARCH_INDEX_KEYS.BOOKMARKS;
  const cached = ServerCacheInstance.get<{
    index: MiniSearch<BookmarkIndexItem>;
    bookmarks: Array<BookmarkIndexItem & { slug: string }>;
  }>(cacheKey);
  if (cached) {
    devLog("[getBookmarksIndex] using cached in-memory index", { items: cached.bookmarks.length });
    return cached;
  }

  // Try the fast path: import bookmarks directly when running server-side and not using S3 indexes.
  let bookmarks: Array<{
    id: string;
    url: string;
    title: string;
    description: string;
    tags?: Array<string | { name?: string }>;
    content?: { author?: string | null; publisher?: string | null };
  }> = [];

  try {
    const { getBookmarks } = await import("@/lib/bookmarks/service.server");
    const all = (await getBookmarks({ includeImageData: false })) as Array<{
      id: string;
      url: string;
      title: string;
      description: string;
      tags?: Array<string | { name?: string }>;
      content?: { author?: string | null; publisher?: string | null };
    }>;
    bookmarks = all;
    devLog("[getBookmarksIndex] fetched bookmarks via direct import", { count: bookmarks.length });
  } catch (directErr) {
    devLog("[getBookmarksIndex] falling back to API fetch");
    console.warn("[Search] Direct bookmarks fetch failed, falling back to /api/bookmarks", directErr);

    const { getBaseUrl } = await import("@/lib/utils/get-base-url");
    const apiUrl = `${getBaseUrl()}/api/bookmarks?limit=10000`;

    const controller = new AbortController();
    const FETCH_TIMEOUT_MS = Number(process.env.SEARCH_BOOKMARKS_TIMEOUT_MS) || 30000; // 30s fallback
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await fetch(apiUrl, { cache: "no-store", signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!resp.ok) {
      throw new Error(`Failed to fetch bookmarks: ${resp.status}`);
    }
    const raw = (await resp.json()) as unknown;
    if (Array.isArray(raw)) {
      bookmarks = raw as typeof bookmarks;
    } else if (typeof raw === "object" && raw !== null) {
      const obj = raw as Record<string, unknown>;
      bookmarks = (obj.data ?? obj.bookmarks ?? []) as typeof bookmarks;
    }
    devLog("[getBookmarksIndex] fetched bookmarks via API", { count: bookmarks.length });
  }

  // At this point `bookmarks` should be populated (possibly empty array)
  bookmarks = bookmarks || [];

  const bookmarksArr = bookmarks as Array<{
    id: string;
    url: string;
    title: string;
    description: string;
    tags?: Array<string | { name?: string }>;
    content?: { author?: string | null; publisher?: string | null };
  }>;

  // Load slug mapping (preferred), but allow embedded slug fallback
  const { loadSlugMapping, getSlugForBookmark } = await import("@/lib/bookmarks/slug-manager");
  const { tryGetEmbeddedSlug } = await import("@/lib/bookmarks/slug-helpers");
  const slugMapping = await loadSlugMapping();
  // If no mapping exists, embedded slugs must be present on input bookmarks

  // Try to load index from S3 if available
  let bookmarksIndex: MiniSearch<BookmarkIndexItem>;

  if (USE_S3_INDEXES) {
    try {
      const serializedIndex = await readJsonS3<SerializedIndex>(SEARCH_S3_PATHS.BOOKMARKS_INDEX);
      if (serializedIndex?.index && serializedIndex.metadata) {
        bookmarksIndex = loadIndexFromJSON<BookmarkIndexItem>(serializedIndex);
        console.log(`[Search] Loaded ${cacheKey} from S3 (${serializedIndex.metadata.itemCount} items)`);
      } else {
        // Build in-memory as fallback
        bookmarksIndex = buildBookmarksIndex(bookmarksArr);
      }
    } catch (error) {
      console.error(`[Search] Error loading ${cacheKey} from S3:`, error);
      // Build in-memory as fallback
      bookmarksIndex = buildBookmarksIndex(bookmarksArr);
    }
  } else {
    // Build in-memory
    bookmarksIndex = buildBookmarksIndex(bookmarksArr);
  }

  // Transform bookmarks for result mapping
  const bookmarksForIndex: Array<BookmarkIndexItem & { slug: string }> = bookmarksArr.map((b) => {
    // Prefer embedded slug; fallback to mapping
    const embedded = tryGetEmbeddedSlug(b);
    const slug = embedded ?? (slugMapping ? getSlugForBookmark(slugMapping, b.id) : null);
    if (!slug) {
      throw new Error(`[Search] CRITICAL: No slug found for bookmark ${b.id}. ` + `Title: ${b.title}, URL: ${b.url}`);
    }

    return {
      id: b.id,
      title: b.title || b.url,
      description: b.description || "",
      tags: Array.isArray(b.tags) ? b.tags.map((t) => (typeof t === "string" ? t : t?.name || "")).join(" ") : "",
      url: b.url,
      author: b.content?.author || "",
      publisher: b.content?.publisher || "",
      slug,
    };
  });

  // Cache the index and bookmarks
  const result = { index: bookmarksIndex, bookmarks: bookmarksForIndex };
  ServerCacheInstance.set(cacheKey, result, BOOKMARK_INDEX_TTL);

  devLog("[getBookmarksIndex] index built", { indexed: bookmarksArr.length });

  return result;
}

function buildBookmarksIndex(
  bookmarks: Array<{
    id: string;
    url: string;
    title: string;
    description: string;
    tags?: Array<string | { name?: string }>;
    content?: { author?: string | null; publisher?: string | null };
  }>,
): MiniSearch<BookmarkIndexItem> {
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
  const bookmarksForIndex: BookmarkIndexItem[] = bookmarks.map((b) => ({
    id: b.id,
    title: b.title || b.url,
    description: b.description || "",
    tags: Array.isArray(b.tags) ? b.tags.map((t) => (typeof t === "string" ? t : t?.name || "")).join(" ") : "",
    url: b.url,
    author: b.content?.author || "",
    publisher: b.content?.publisher || "",
  }));

  // Add to index
  bookmarksIndex.addAll(bookmarksForIndex);

  return bookmarksIndex;
}

export async function searchBookmarks(query: string): Promise<SearchResult[]> {
  try {
    devLog("[searchBookmarks] query", { query });
    // Check result cache first
    const cached = ServerCacheInstance.getSearchResults<SearchResult>("bookmarks", query);
    if (cached && !ServerCacheInstance.shouldRefreshSearch("bookmarks", query)) {
      devLog("[searchBookmarks] results", { count: cached.results.length });
      return cached.results;
    }

    // Get bookmarks index
    let indexData: { index: MiniSearch<BookmarkIndexItem>; bookmarks: Array<BookmarkIndexItem & { slug: string }> };
    try {
      indexData = await getBookmarksIndex();
    } catch (error) {
      console.error(`[searchBookmarks] Failed to get bookmarks index:`, error);
      if (cached && Array.isArray(cached.results)) {
        devLog("[searchBookmarks] returning cached results", { count: cached.results.length });
        return cached.results;
      }
      return [];
    }

    const { index, bookmarks } = indexData;

    // No query? Return empty results (standard REST pattern)
    // This avoids performance issues with large datasets
    if (!query) {
      return [];
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
    const scoreById = new Map(searchResults.map((r) => [String(r.id), r.score ?? 0] as const));
    const results: SearchResult[] = bookmarks
      .filter((b) => resultIds.has(b.id))
      .map((b): SearchResult => ({
        id: b.id,
        type: "bookmark" as const,
        title: b.title,
        description: b.description,
        url: `/bookmarks/${b.slug}`,
        score: scoreById.get(b.id) ?? 0,
      }))
      .sort((a, b) => b.score - a.score);

    devLog("[searchBookmarks] results", { count: results.length });
    // Cache the results
    ServerCacheInstance.setSearchResults("bookmarks", query, results);

    return results;
  } catch (err) {
    console.error("[searchBookmarks] Unexpected failure:", err);
    // Return cached results if available on error
    const cached = ServerCacheInstance.getSearchResults<SearchResult>("bookmarks", query);
    if (cached && Array.isArray(cached.results)) {
      devLog("[searchBookmarks] returning cached results", { count: cached.results.length });
      return cached.results;
    }
    return [];
  }
}

// Cache invalidation functions for search
export function invalidateSearchCache(): void {
  if (USE_NEXTJS_CACHE) {
    // Invalidate all search cache tags
    safeRevalidateTag("search");
    safeRevalidateTag("posts-search");
    console.log("[Search] Cache invalidated for all search results");
  }
}

// Invalidate search cache for a specific query
export function invalidateSearchQueryCache(query: string): void {
  if (USE_NEXTJS_CACHE) {
    const truncatedQuery = query.slice(0, 20);
    safeRevalidateTag(`search-posts-${truncatedQuery}`);
    console.log(`[Search] Cache invalidated for query: ${truncatedQuery}`);
  }
}

function buildProjectsIndex(): MiniSearch<Project> {
  const projectsIndex = new MiniSearch<Project>({
    fields: ["name", "description", "tags"],
    storeFields: ["name", "description", "url"],
    idField: "name",
    searchOptions: { boost: { name: 2 }, fuzzy: 0.2, prefix: true },
  });

  // Deduplicate by name (assumed unique) - explicitly type the result
  const deduped: Project[] = prepareDocumentsForIndexing(projectsData, "Projects", (p) => p.name);
  projectsIndex.addAll(deduped);
  return projectsIndex;
}

async function getProjectsIndex(): Promise<MiniSearch<Project>> {
  return loadOrBuildIndex(
    SEARCH_S3_PATHS.PROJECTS_INDEX,
    SEARCH_INDEX_KEYS.PROJECTS,
    buildProjectsIndex,
    STATIC_INDEX_TTL,
  );
}

export async function searchProjects(query: string): Promise<SearchResult[]> {
  const cached = ServerCacheInstance.getSearchResults<SearchResult>("projects", query);
  if (cached && !ServerCacheInstance.shouldRefreshSearch("projects", query)) {
    return cached.results;
  }

  const index = await getProjectsIndex();
  const results = searchContent(
    projectsData,
    query,
    (p) => [p.name, p.description, (p.tags || []).join(" ")],
    (p) => p.name,
    index,
  );

  const searchResults: SearchResult[] = results.map<SearchResult>((p) => ({
    id: p.name,
    type: "project",
    title: p.name,
    description: p.shortSummary || p.description,
    url: p.url ?? "/projects",
    score: 0,
  }));

  // If the query is exactly "projects", add navigation result to Projects page at top
  const sanitized = sanitizeSearchQuery(query).toLowerCase();
  if (sanitized === "projects" || sanitized === "project") {
    searchResults.unshift({
      id: "projects-page",
      type: "page",
      title: "Projects",
      description: "Explore all projects",
      url: "/projects",
      score: 1,
    });
  }

  ServerCacheInstance.setSearchResults("projects", query, searchResults);
  return searchResults;
}
