/**
 * Search Utilities
 */

import { PAGE_METADATA } from "@/data/metadata";
import { certifications, education } from "@/data/education";
import { experiences } from "@/data/experience";
import { investments } from "@/data/investments";
import { projects as projectsData } from "@/data/projects";
import type {
  SearchResult,
  EducationItem,
  BookmarkIndexItem,
  ScoredResult,
  AggregatedTag,
  MiniSearchStoredFields,
} from "../types/search";
import type { Book } from "@/types/schemas/book";
import MiniSearch from "minisearch";
import { ServerCacheInstance } from "./server-cache";
import { sanitizeSearchQuery } from "./validators/search";
import { prepareDocumentsForIndexing } from "./utils/search-helpers";
import { cacheContextGuards, USE_NEXTJS_CACHE } from "./cache";
import { SEARCH_S3_PATHS, DEFAULT_BOOKMARK_OPTIONS } from "./constants";
import { readJsonS3 } from "./s3-utils";
import type { SerializedIndex } from "@/types/search";
import { loadIndexFromJSON } from "./search/index-builder";
import type { Project } from "../types/project";
import { envLogger } from "@/lib/utils/env-logger";
import { fetchBooks } from "@/lib/books/audiobookshelf.server";
import { generateBookSlug } from "@/lib/books/slug-helpers";
import { formatTagDisplay, tagToSlug } from "./utils/tag-utils";

// Add near top of file (after imports) a dev log helper
const IS_DEV = process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";
const devLog = (...args: unknown[]) => {
  if (IS_DEV) console.log("[SearchDev]", ...args);
};

// Type-safe wrapper for cache tag revalidation
const safeRevalidateTag = (...tags: string[]): void => {
  cacheContextGuards.revalidateTag("Search", ...tags);
};

// --- MiniSearch Index Management ---

// Cache keys for MiniSearch indexes
const SEARCH_INDEX_KEYS = {
  INVESTMENTS: "search:index:investments",
  EXPERIENCE: "search:index:experience",
  EDUCATION: "search:index:education",
  BOOKMARKS: "search:index:bookmarks",
  PROJECTS: "search:index:projects",
  BOOKS: "search:index:books",
  BOOKS_DATA: "search:books-data", // Shared cache for full Book[] data
} as const;

// TTL for search indexes (1 hour for static, 5 minutes for dynamic)
const STATIC_INDEX_TTL = 60 * 60; // 1 hour in seconds
const BOOKMARK_INDEX_TTL = 5 * 60; // 5 minutes in seconds
const BOOK_INDEX_TTL = 2 * 60 * 60; // 2 hours for slower-changing bookshelf
const BOOKS_DATA_TTL = 2 * 60 * 60; // 2 hours - shared between search index and genre extraction

// Flag to control whether to load indexes from S3 or build in-memory
// Default: true (use S3 indexes for reliability and performance)
// Set USE_S3_SEARCH_INDEXES=false to force live fetching
const USE_S3_INDEXES = process.env.USE_S3_SEARCH_INDEXES !== "false";

function parseSerializedIndexObject(serializedIndex: SerializedIndex): Record<string, unknown> | null {
  if (typeof serializedIndex.index === "string") {
    try {
      const parsed = JSON.parse(serializedIndex.index) as unknown;
      if (isRecord(parsed)) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }
  return isRecord(serializedIndex.index) ? serializedIndex.index : null;
}

function extractBookmarksFromSerializedIndex(
  serializedIndex: SerializedIndex,
): Array<BookmarkIndexItem & { slug: string }> {
  const indexObject = parseSerializedIndexObject(serializedIndex);
  if (!indexObject) {
    return [];
  }

  const documentIdsRaw = (indexObject as { documentIds?: unknown }).documentIds;
  const storedFieldsRaw = (indexObject as { storedFields?: unknown }).storedFields;

  if (!isRecord(documentIdsRaw) || !isRecord(storedFieldsRaw)) {
    return [];
  }

  const bookmarks: Array<BookmarkIndexItem & { slug: string }> = [];
  for (const [shortId, docId] of Object.entries(documentIdsRaw)) {
    const stored = storedFieldsRaw[shortId];
    if (!isRecord(stored)) continue;

    const storedFields = stored as MiniSearchStoredFields;
    const id =
      typeof storedFields.id === "string"
        ? storedFields.id
        : typeof docId === "string"
          ? docId
          : typeof docId === "number"
            ? String(docId)
            : null;
    const slug = typeof storedFields.slug === "string" ? storedFields.slug : null;

    if (!id || !slug) continue;

    const title =
      typeof storedFields.title === "string" && storedFields.title.length > 0
        ? storedFields.title
        : typeof storedFields.url === "string" && storedFields.url.length > 0
          ? storedFields.url
          : slug;

    bookmarks.push({
      id,
      title,
      description: typeof storedFields.description === "string" ? storedFields.description : "",
      tags: "",
      url: typeof storedFields.url === "string" ? storedFields.url : "",
      author: "",
      publisher: "",
      slug,
    });
  }

  return bookmarks;
}

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
        envLogger.log(`Failed to load ${cacheKey} from S3, building in-memory`, undefined, { category: "Search" });
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
 * Returns items with relevance scores for proper ranking.
 *
 * @param items - Array of items to search
 * @param query - Search query string
 * @param getSearchableFields - Function to extract searchable text from an item
 * @param getExactMatchField - Optional function to get field for exact matching
 * @param miniSearchIndex - Optional pre-built MiniSearch index
 * @param getItemId - Optional function to extract ID from item (defaults to item.id)
 * @returns Filtered array of items with scores, sorted by relevance
 */
function searchContent<T>(
  items: T[],
  query: string,
  getSearchableFields: (item: T) => (string | undefined | null)[],
  getExactMatchField?: (item: T) => string,
  miniSearchIndex?: MiniSearch<T> | null,
  getItemId?: (item: T) => string,
): ScoredResult<T>[] {
  // Sanitize the query first
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) return items.map(item => ({ item, score: 0 }));

  // Helper to extract item ID
  const extractId = (item: T): string => {
    if (getItemId) return getItemId(item);
    const itemWithId = item as T & { id?: string | number; name?: string; slug?: string };
    return String(itemWithId.id ?? itemWithId.name ?? itemWithId.slug ?? item);
  };

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

      // Reuse pattern from searchBookmarks(): capture scores in a Map
      const resultIds = new Set(searchResults.map(r => String(r.id)));
      const scoreById = new Map(searchResults.map(r => [String(r.id), r.score ?? 0] as const));

      return items
        .filter(item => resultIds.has(extractId(item)))
        .map(item => ({
          item,
          score: scoreById.get(extractId(item)) ?? 0,
        }))
        .toSorted((a, b) => b.score - a.score);
    } catch (error) {
      envLogger.log(
        "MiniSearch failed, falling back to substring search",
        { error: String(error) },
        { category: "Search" },
      );
      // Fall through to substring search
    }
  }

  // Fallback: Original substring search implementation with basic scoring
  const searchTerms = sanitizedQuery.split(/\s+/).filter(Boolean);

  return items
    .filter(item => {
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
      return searchTerms.every(term => allContentText.includes(term));
    })
    .map(item => {
      // Calculate a basic relevance score for substring matches
      const exactField = getExactMatchField?.(item)?.toLowerCase() ?? "";
      if (exactField === sanitizedQuery) {
        return { item, score: 1.0 }; // Exact match = highest score
      }
      // Partial matches get a lower score
      return { item, score: 0.5 };
    });
}

// --- Helper functions to create MiniSearch indexes ---

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
  const scoredResults = searchContent(
    investments,
    query,
    inv => [
      inv.name,
      inv.description,
      inv.type,
      inv.status,
      inv.founded_year,
      inv.invested_year,
      inv.acquired_year,
      inv.shutdown_year,
    ],
    inv => inv.name,
    index,
  );

  const searchResults: SearchResult[] = scoredResults.map(({ item: inv, score }) => ({
    id: inv.id,
    type: "project",
    title: inv.name,
    description: inv.description,
    url: `/investments#${inv.id}`,
    score,
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
  const scoredResults = searchContent(
    experiences,
    query,
    exp => [exp.company, exp.role, exp.period],
    exp => exp.company,
    index,
  );

  const searchResults: SearchResult[] = scoredResults.map(({ item: exp, score }) => ({
    id: exp.id,
    type: "project",
    title: exp.company,
    description: exp.role,
    url: `/experience#${exp.id}`,
    score,
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
    ...education.map(edu => ({
      id: edu.id,
      label: edu.institution,
      description: edu.degree,
      path: `/education#${edu.id}`,
    })),
    ...certifications.map(cert => ({
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
    ...education.map(edu => ({
      id: edu.id,
      label: edu.institution,
      description: edu.degree,
      path: `/education#${edu.id}`,
      searchableText: [edu.institution, edu.degree], // For search
    })),
    ...certifications.map(cert => ({
      id: cert.id,
      label: cert.institution,
      description: cert.name,
      path: `/education#${cert.id}`,
      searchableText: [cert.institution, cert.name], // For search
    })),
  ];

  const scoredResults = searchContent(
    allItems,
    query,
    item => item.searchableText,
    item => item.label, // Exact match on institution
    index,
  );

  // Remove the temporary searchableText field and use relevance scores
  const searchResults: SearchResult[] = scoredResults.map(({ item, score }) => ({
    id: item.id,
    type: "page",
    title: item.label,
    description: item.description,
    url: item.path,
    score,
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
  let shouldBlockForMemoryPressure = false;
  try {
    const { getMemoryHealthMonitor } = await import("@/lib/health/memory-health-monitor");
    shouldBlockForMemoryPressure = !getMemoryHealthMonitor().shouldAcceptNewRequests();
  } catch {
    /* If monitor not available, continue without blocking */
  }
  if (shouldBlockForMemoryPressure) {
    throw new Error("Memory pressure – aborting bookmarks index build");
  }

  devLog("[getBookmarksIndex] Building/Loading bookmarks index. start");
  // Try to get from cache first
  const cacheKey = SEARCH_INDEX_KEYS.BOOKMARKS;
  const cached = ServerCacheInstance.get<{
    index: MiniSearch<BookmarkIndexItem>;
    bookmarks: Array<BookmarkIndexItem & { slug: string }>;
  }>(cacheKey);

  // CRITICAL: Use bracket notation to prevent Turbopack from inlining NEXT_PHASE at build time
  const PHASE_KEY = "NEXT_PHASE";
  const BUILD_VALUE = "phase-production-build";
  const isBuildPhase = process.env[PHASE_KEY] === BUILD_VALUE;

  if (cached) {
    // SAFEGUARD: Don't use cached empty indexes outside build phase - they may be stale
    // from a cold start when slug mapping wasn't yet available. Rebuild instead.
    if (cached.bookmarks.length === 0 && !isBuildPhase) {
      devLog("[getBookmarksIndex] cached index is empty outside build phase, attempting rebuild");
      envLogger.log(
        "[Search] Cached bookmarks index is empty - rebuilding (possible stale cache from cold start)",
        {},
        { category: "Search" },
      );
      // Don't return cached - fall through to rebuild
    } else {
      devLog("[getBookmarksIndex] using cached in-memory index", { items: cached.bookmarks.length });
      return cached;
    }
  }
  if (isBuildPhase) {
    devLog("[getBookmarksIndex] build phase detected, returning empty index");
    const emptyResult = { index: buildBookmarksIndex([]), bookmarks: [] };
    ServerCacheInstance.set(cacheKey, emptyResult, BOOKMARK_INDEX_TTL);
    return emptyResult;
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
  let serializedBookmarksIndex: SerializedIndex | null = null;

  try {
    const { getBookmarks } = await import("@/lib/bookmarks/service.server");
    const all = (await getBookmarks({
      ...DEFAULT_BOOKMARK_OPTIONS,
      includeImageData: false,
      skipExternalFetch: false,
      force: false,
    })) as Array<{
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
    // Use bracket notation to prevent Turbopack inlining (see PHASE_KEY above)
    const skipApiFallback = process.env[PHASE_KEY] === BUILD_VALUE;
    if (skipApiFallback) {
      envLogger.log(
        "Direct bookmarks fetch failed during build phase; skipping /api/bookmarks fallback",
        { error: String(directErr) },
        { category: "Search" },
      );
      bookmarks = [];
    } else {
      devLog("[getBookmarksIndex] falling back to API fetch");
      envLogger.log(
        "Direct bookmarks fetch failed, falling back to /api/bookmarks",
        { error: String(directErr) },
        { category: "Search" },
      );

      const { getBaseUrl } = await import("@/lib/utils/get-base-url");
      const apiUrl = `${getBaseUrl()}/api/bookmarks?limit=10000`;

      const controller = new AbortController();
      const FETCH_TIMEOUT_MS = Number(process.env.SEARCH_BOOKMARKS_TIMEOUT_MS) || 30000; // 30s fallback
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      let resp: Response | undefined;
      try {
        resp = await fetch(apiUrl, { cache: "no-store", signal: controller.signal });
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      }
      clearTimeout(timeoutId);

      // Check response status after successful fetch
      if (!resp || !resp.ok) {
        // oxlint-disable-next-line preserve-caught-error -- False positive: Not re-throwing, checking HTTP status
        throw new Error(`Failed to fetch bookmarks: HTTP ${resp?.status ?? "unknown"} ${resp?.statusText ?? ""}`);
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
        serializedBookmarksIndex = serializedIndex;
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
  const bookmarksForIndex: Array<BookmarkIndexItem & { slug: string }> = [];

  for (const b of bookmarksArr) {
    // Prefer embedded slug; fallback to mapping
    const embedded = tryGetEmbeddedSlug(b);
    const slug = embedded ?? (slugMapping ? getSlugForBookmark(slugMapping, b.id) : null);

    if (!slug) {
      // Log warning but continue processing other bookmarks
      envLogger.log("No slug found for bookmark", { id: b.id, title: b.title, url: b.url }, { category: "Search" });
      // Skip this bookmark instead of throwing
      continue;
    }

    bookmarksForIndex.push({
      id: b.id,
      title: b.title || b.url,
      description: b.description || "",
      // Use newline delimiter to preserve multi-word tags (e.g., "machine learning")
      tags: Array.isArray(b.tags) ? b.tags.map(t => (typeof t === "string" ? t : t?.name || "")).join("\n") : "",
      url: b.url,
      author: b.content?.author || "",
      publisher: b.content?.publisher || "",
      slug,
    });
  }

  if (bookmarksForIndex.length === 0 && bookmarksArr.length === 0 && serializedBookmarksIndex) {
    const reconstructed = extractBookmarksFromSerializedIndex(serializedBookmarksIndex);
    if (reconstructed.length > 0) {
      bookmarksForIndex.push(...reconstructed);
      devLog("[getBookmarksIndex] using stored fields from S3 index for mapping", {
        reconstructed: reconstructed.length,
        s3Documents: serializedBookmarksIndex.metadata.itemCount,
      });
    } else {
      envLogger.log(
        "[Search] Unable to reconstruct bookmarks from S3 index stored fields",
        { itemCount: serializedBookmarksIndex.metadata.itemCount },
        { category: "Search" },
      );
    }
  }

  // Cache the index and bookmarks
  const result = { index: bookmarksIndex, bookmarks: bookmarksForIndex };

  // CRITICAL: Do NOT cache empty indexes when source data exists but couldn't be indexed
  // This happens when slug mapping is temporarily unavailable (e.g., during cold start).
  // Caching the empty result would cause all subsequent searches to fail until cache expires.
  const serializedIndexCount = serializedBookmarksIndex?.metadata?.itemCount ?? 0;
  if (bookmarksForIndex.length === 0 && (bookmarksArr.length > 0 || serializedIndexCount > 0)) {
    envLogger.log(
      "[Search] SKIPPING CACHE: Empty bookmarks index despite available bookmark data (source or S3 index)",
      { sourceCount: bookmarksArr.length, indexedCount: 0, serializedIndexCount },
      { category: "Search" },
    );
    // Return result without caching - next request will retry and may succeed if slug mapping becomes available
  } else {
    ServerCacheInstance.set(cacheKey, result, BOOKMARK_INDEX_TTL);
  }

  devLog("[getBookmarksIndex] index built", {
    indexed: bookmarksForIndex.length,
    sourceBookmarks: bookmarksArr.length,
    serializedIndexCount,
  });

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
    slug?: string; // May have embedded slug
  }>,
): MiniSearch<BookmarkIndexItem> {
  // Create MiniSearch index
  const bookmarksIndex = new MiniSearch<BookmarkIndexItem>({
    fields: ["title", "description", "tags", "author", "publisher", "url", "slug"],
    storeFields: ["id", "title", "description", "url", "slug"], // Include slug in stored fields
    idField: "id",
    searchOptions: {
      boost: { title: 2, description: 1.5 },
      fuzzy: 0.2,
      prefix: true,
    },
  });

  // Transform bookmarks for indexing - SKIP if no slug
  const bookmarksForIndex: BookmarkIndexItem[] = [];
  for (const b of bookmarks) {
    // For buildBookmarksIndex, we need to generate a fallback slug if not present
    // This happens when called directly without slug mapping
    const slug = b.slug || `${b.url.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${b.id.slice(0, 8)}`;

    bookmarksForIndex.push({
      id: b.id,
      title: b.title || b.url,
      description: b.description || "",
      // Use newline delimiter to preserve multi-word tags (e.g., "machine learning")
      tags: Array.isArray(b.tags) ? b.tags.map(t => (typeof t === "string" ? t : t?.name || "")).join("\n") : "",
      url: b.url,
      author: b.content?.author || "",
      publisher: b.content?.publisher || "",
      slug, // REQUIRED field
    });
  }

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
    const resultIds = new Set(searchResults.map(r => String(r.id)));
    const scoreById = new Map(searchResults.map(r => [String(r.id), r.score ?? 0] as const));
    const results: SearchResult[] = bookmarks
      .filter(b => resultIds.has(b.id))
      .map(
        (b): SearchResult => ({
          id: b.id,
          type: "bookmark" as const,
          title: b.title,
          description: b.description,
          url: `/bookmarks/${b.slug}`,
          score: scoreById.get(b.id) ?? 0,
        }),
      )
      .toSorted((a, b) => b.score - a.score);

    devLog("[searchBookmarks] results", { count: results.length });
    // CRITICAL: Do NOT cache empty results when the index itself was empty.
    // If bookmarks.length === 0, it means no bookmarks could be indexed (slug mapping unavailable).
    // Caching empty results would cause all subsequent searches to fail until cache expires (15 min).
    // Only cache if the index was healthy (has documents) - empty search results from a healthy index are valid.
    if (bookmarks.length > 0) {
      ServerCacheInstance.setSearchResults("bookmarks", query, results);
    } else if (results.length === 0) {
      envLogger.log(
        "[searchBookmarks] SKIPPING RESULT CACHE: Empty results from empty index - slug mapping likely unavailable",
        { query, indexedBookmarks: bookmarks.length, resultsCount: results.length },
        { category: "Search" },
      );
    }

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
  const deduped: Project[] = prepareDocumentsForIndexing(projectsData, "Projects", p => p.name);
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
  const scoredResults = searchContent(
    projectsData,
    query,
    p => [p.name, p.description, (p.tags || []).join(" ")],
    p => p.name,
    index,
    p => p.name, // Use name as ID (matches MiniSearch idField)
  );

  const searchResults: SearchResult[] = scoredResults.map<SearchResult>(({ item: p, score }) => ({
    id: p.name,
    type: "project",
    title: p.name,
    description: p.shortSummary || p.description,
    url: p.url ?? "/projects",
    score,
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

// --- Books Search ---
// Uses shared books data cache for both search index and genre extraction

/**
 * Shared cache for full Book[] data.
 * Called by both getBooksIndex() and getBookGenresWithCounts() to avoid duplicate API calls.
 * This consolidation saves one external API call per cold-start site-wide search.
 */
async function getCachedBooksData(): Promise<Book[]> {
  const cacheKey = SEARCH_INDEX_KEYS.BOOKS_DATA;
  const cached = ServerCacheInstance.get<Book[]>(cacheKey);
  if (cached) {
    devLog("[getCachedBooksData] Using cached books data", { count: cached.length });
    return cached;
  }

  let books: Book[] = [];
  try {
    devLog("[getCachedBooksData] Fetching full books from AudioBookShelf...");
    books = await fetchBooks();
    devLog("[getCachedBooksData] Fetched books", { count: books.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    envLogger.log("[Search] Failed to fetch books", { error: message }, { category: "Search" });
    console.error("[Search] Books fetch failed:", message);
    return [];
  }

  if (books.length === 0) {
    console.warn("[Search] WARNING: No books returned from AudioBookShelf");
  }

  ServerCacheInstance.set(cacheKey, books, BOOKS_DATA_TTL);
  return books;
}

function buildBooksIndex(books: Book[]): MiniSearch<Book> {
  const booksIndex = new MiniSearch<Book>({
    fields: ["title", "authors"],
    storeFields: ["id", "title", "authors", "coverUrl"],
    idField: "id",
    searchOptions: { boost: { title: 2 }, fuzzy: 0.2, prefix: true },
    extractField: (document, fieldName) => {
      // CRITICAL: MiniSearch uses extractField for ALL fields including the ID field.
      // We must return the actual ID, not an empty string, or all docs get duplicate ID "".
      if (fieldName === "id") {
        return document.id;
      }
      // authors is string[] - join for MiniSearch text indexing
      if (fieldName === "authors") {
        return Array.isArray(document.authors) ? document.authors.join(" ") : "";
      }
      if (fieldName === "title") {
        return typeof document.title === "string" ? document.title : "";
      }
      return "";
    },
  });

  const deduped = prepareDocumentsForIndexing(books, "Books");
  booksIndex.addAll(deduped);
  return booksIndex;
}

async function getBooksIndex(): Promise<MiniSearch<Book>> {
  const cacheKey = SEARCH_INDEX_KEYS.BOOKS;
  const cached = ServerCacheInstance.get<MiniSearch<Book>>(cacheKey);
  if (cached) {
    devLog("[getBooksIndex] Using cached books index");
    return cached;
  }

  let booksIndex: MiniSearch<Book>;

  // Try to load from S3 first (pre-built index)
  if (USE_S3_INDEXES) {
    try {
      devLog("[getBooksIndex] Trying to load books index from S3...");
      const serializedIndex = await readJsonS3<SerializedIndex>(SEARCH_S3_PATHS.BOOKS_INDEX);
      if (serializedIndex?.index && serializedIndex.metadata) {
        booksIndex = loadIndexFromJSON<Book>(serializedIndex);
        console.log(`[Search] Loaded ${cacheKey} from S3 (${serializedIndex.metadata.itemCount} items)`);
        ServerCacheInstance.set(cacheKey, booksIndex, BOOK_INDEX_TTL);
        return booksIndex;
      }
      devLog("[getBooksIndex] S3 index not found or invalid, falling back to shared cache");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      devLog("[getBooksIndex] S3 load failed, falling back to shared cache:", message);
    }
  }

  // Use shared books data cache (consolidates with getBookGenresWithCounts)
  const books = await getCachedBooksData();

  if (books.length === 0) {
    // Return empty index so search still resolves without throwing
    const emptyIndex = buildBooksIndex([]);
    ServerCacheInstance.set(cacheKey, emptyIndex, BOOK_INDEX_TTL);
    return emptyIndex;
  }

  console.log(`[Search] Building books index with ${books.length} books (from shared cache)`);
  booksIndex = buildBooksIndex(books);
  ServerCacheInstance.set(cacheKey, booksIndex, BOOK_INDEX_TTL);
  return booksIndex;
}

/** Type guard to check if value is a non-null object */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export async function searchBooks(query: string): Promise<SearchResult[]> {
  devLog("[searchBooks] Query:", query);

  const cached = ServerCacheInstance.getSearchResults<SearchResult>("books", query);
  if (cached && !ServerCacheInstance.shouldRefreshSearch("books", query)) {
    devLog("[searchBooks] Returning cached results", { count: cached.results.length });
    return cached.results;
  }

  const index = await getBooksIndex();
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) {
    devLog("[searchBooks] Empty sanitized query, returning []");
    return [];
  }

  // Log index document count for debugging
  const indexDocCount = index.documentCount;
  devLog("[searchBooks] Index document count:", indexDocCount);

  if (indexDocCount === 0) {
    console.warn("[Search] Books index is empty - no books to search");
    return [];
  }

  const searchResultsUnknown: unknown = index.search(sanitizedQuery, {
    prefix: true,
    fuzzy: 0.2,
    boost: { title: 2 },
    combineWith: "AND",
  });

  // Runtime validation of MiniSearch results
  const hits = Array.isArray(searchResultsUnknown) ? searchResultsUnknown : [];
  devLog("[searchBooks] Raw hits from MiniSearch:", hits.length);

  const searchResultsRaw = hits
    .map(hit => {
      if (!isRecord(hit)) return null;
      const id = hit.id;
      if (typeof id !== "string" && typeof id !== "number") return null;
      return {
        id,
        title: typeof hit.title === "string" ? hit.title : undefined,
        authors: Array.isArray(hit.authors) ? hit.authors.filter((a): a is string => typeof a === "string") : undefined,
        score: typeof hit.score === "number" ? hit.score : undefined,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  const scoreById = new Map(searchResultsRaw.map(r => [String(r.id), r.score ?? 0] as const));

  // Map back to stored fields
  const results: SearchResult[] = searchResultsRaw.map(({ id, title, authors }) => ({
    id: String(id),
    type: "page",
    title: title ?? "Untitled",
    description: Array.isArray(authors) ? authors.join(", ") : undefined,
    url: `/books/${generateBookSlug(title ?? "", String(id), Array.isArray(authors) ? authors : undefined)}`,
    score: scoreById.get(String(id)) ?? 0,
  }));

  devLog("[searchBooks] Final results:", results.length);
  ServerCacheInstance.setSearchResults("books", query, results);
  return results;
}

// --- Thoughts Search ---
// Currently returns a navigation result for /thoughts collection page.
// Will be enhanced with Chroma vector store when available.

export function searchThoughts(query: string): Promise<SearchResult[]> {
  const sanitized = sanitizeSearchQuery(query);
  if (!sanitized) return Promise.resolve([]);
  const pageTitle = typeof PAGE_METADATA.thoughts.title === "string" ? PAGE_METADATA.thoughts.title : "Thoughts";
  const pageDescription =
    typeof PAGE_METADATA.thoughts.description === "string" ? PAGE_METADATA.thoughts.description : undefined;
  return Promise.resolve([
    {
      id: "thoughts-page",
      type: "page",
      title: pageTitle,
      description: pageDescription,
      url: "/thoughts",
      score: 0.1,
    },
  ]);
}

// --- Tags Search ---
// Searchable sub-index of tags from Blog, Bookmarks, Projects, and Books

// Cache key and TTL for aggregated tags
const TAGS_CACHE_KEY = "search:aggregated-tags";
const TAGS_CACHE_TTL = 10 * 60; // 10 minutes

/**
 * Get blog post tags with counts from MDX posts
 */
async function getBlogTagsWithCounts(): Promise<AggregatedTag[]> {
  try {
    const { getAllMDXPostsForSearch } = await import("@/lib/blog/mdx");
    const posts = await getAllMDXPostsForSearch();
    const tagCounts = new Map<string, number>();

    for (const post of posts) {
      if (!post.tags) continue;
      for (const tag of post.tags) {
        const normalizedTag = tag.toLowerCase();
        tagCounts.set(normalizedTag, (tagCounts.get(normalizedTag) ?? 0) + 1);
      }
    }

    return Array.from(tagCounts.entries()).map(([tag, count]) => ({
      name: tag,
      slug: tagToSlug(tag),
      contentType: "blog" as const,
      count,
      url: `/blog/tags/${tagToSlug(tag)}`,
    }));
  } catch (error) {
    envLogger.log("Failed to get blog tags", { error: String(error) }, { category: "Search" });
    return [];
  }
}

/**
 * Get project tags with counts
 */
function getProjectTagsWithCounts(): AggregatedTag[] {
  const tagCounts = new Map<string, number>();

  for (const project of projectsData) {
    if (!project.tags) continue;
    for (const tag of project.tags) {
      const normalizedTag = tag.toLowerCase();
      tagCounts.set(normalizedTag, (tagCounts.get(normalizedTag) ?? 0) + 1);
    }
  }

  return Array.from(tagCounts.entries()).map(([tag, count]) => ({
    name: tag,
    slug: tagToSlug(tag),
    contentType: "projects" as const,
    count,
    url: `/projects?tag=${tagToSlug(tag)}`,
  }));
}

/**
 * Get bookmark tags with counts from indexed bookmarks
 */
async function getBookmarkTagsWithCounts(): Promise<AggregatedTag[]> {
  try {
    const { bookmarks } = await getBookmarksIndex();
    const tagCounts = new Map<string, number>();

    for (const bookmark of bookmarks) {
      // tags is a newline-separated string in the index (preserves multi-word tags)
      const tags = bookmark.tags.split("\n").filter(Boolean);
      for (const tag of tags) {
        const normalizedTag = tag.toLowerCase();
        tagCounts.set(normalizedTag, (tagCounts.get(normalizedTag) ?? 0) + 1);
      }
    }

    return Array.from(tagCounts.entries()).map(([tag, count]) => ({
      name: tag,
      slug: tagToSlug(tag),
      contentType: "bookmarks" as const,
      count,
      url: `/bookmarks/tags/${tagToSlug(tag)}`,
    }));
  } catch (error) {
    envLogger.log("Failed to get bookmark tags", { error: String(error) }, { category: "Search" });
    return [];
  }
}

/**
 * Get book genres with counts.
 * Uses shared books data cache to avoid duplicate API calls with getBooksIndex().
 */
async function getBookGenresWithCounts(): Promise<AggregatedTag[]> {
  try {
    // Use shared cache instead of separate fetchBooks() call
    const books = await getCachedBooksData();
    const genreCounts = new Map<string, number>();

    for (const book of books) {
      if (!book.genres) continue;
      for (const genre of book.genres) {
        const normalizedGenre = genre.toLowerCase();
        genreCounts.set(normalizedGenre, (genreCounts.get(normalizedGenre) ?? 0) + 1);
      }
    }

    return Array.from(genreCounts.entries()).map(([genre, count]) => ({
      name: genre,
      slug: tagToSlug(genre),
      contentType: "books" as const,
      count,
      url: `/books?genre=${tagToSlug(genre)}`,
    }));
  } catch (error) {
    envLogger.log("Failed to get book genres", { error: String(error) }, { category: "Search" });
    return [];
  }
}

/**
 * Aggregate all tags from all content types
 */
async function aggregateAllTags(): Promise<AggregatedTag[]> {
  // Check cache first
  const cached = ServerCacheInstance.get<AggregatedTag[]>(TAGS_CACHE_KEY);
  if (cached) {
    return cached;
  }

  // Gather tags from all sources in parallel
  const [blogTags, projectTags, bookmarkTags, bookGenres] = await Promise.all([
    getBlogTagsWithCounts(),
    Promise.resolve(getProjectTagsWithCounts()),
    getBookmarkTagsWithCounts(),
    getBookGenresWithCounts(),
  ]);

  const allTags = [...blogTags, ...projectTags, ...bookmarkTags, ...bookGenres];

  // Cache the aggregated tags
  ServerCacheInstance.set(TAGS_CACHE_KEY, allTags, TAGS_CACHE_TTL);

  return allTags;
}

/**
 * Format tag title for terminal display
 * Format: [Blog] > [Tags] > React
 */
function formatTagTitle(tag: AggregatedTag): string {
  const categoryLabel: Record<AggregatedTag["contentType"], string> = {
    blog: "Blog",
    bookmarks: "Bookmarks",
    projects: "Projects",
    books: "Books",
  };

  const tagTypeLabel = tag.contentType === "books" ? "Genres" : "Tags";
  const displayName = formatTagDisplay(tag.name);

  return `[${categoryLabel[tag.contentType]}] > [${tagTypeLabel}] > ${displayName}`;
}

/**
 * Search tags across all content types
 * Returns tags matching the query with proper hierarchy display
 */
export async function searchTags(query: string): Promise<SearchResult[]> {
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) return [];

  // Check result cache first
  const cached = ServerCacheInstance.getSearchResults<SearchResult>("tags", sanitizedQuery);
  if (cached && !ServerCacheInstance.shouldRefreshSearch("tags", sanitizedQuery)) {
    return cached.results;
  }

  const allTags = await aggregateAllTags();

  // Filter tags by query using fuzzy substring matching
  const queryLower = sanitizedQuery.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter(Boolean);

  const matchingTags = allTags
    .map(tag => {
      const tagNameLower = tag.name.toLowerCase();

      // Calculate match score
      let score = 0;

      // Exact match gets highest score
      if (tagNameLower === queryLower) {
        score = 1.0;
      }
      // Starts with query gets high score
      else if (tagNameLower.startsWith(queryLower)) {
        score = 0.8;
      }
      // Contains all query terms
      else if (queryTerms.every(term => tagNameLower.includes(term))) {
        score = 0.6;
      }
      // Contains any query term
      else if (queryTerms.some(term => tagNameLower.includes(term))) {
        score = 0.4;
      }
      // No match
      else {
        return null;
      }

      // Boost score by count (more items = more relevant tag)
      const countBoost = Math.min(tag.count / 20, 0.2); // Max 0.2 boost
      score += countBoost;

      return { tag, score };
    })
    .filter((result): result is { tag: AggregatedTag; score: number } => result !== null)
    .toSorted((a, b) => b.score - a.score);

  // Limit results per content type to prevent overwhelming results
  const MAX_TAGS_PER_TYPE = 5;
  const tagsByType = new Map<AggregatedTag["contentType"], number>();
  const limitedTags = matchingTags.filter(({ tag }) => {
    const currentCount = tagsByType.get(tag.contentType) ?? 0;
    if (currentCount >= MAX_TAGS_PER_TYPE) return false;
    tagsByType.set(tag.contentType, currentCount + 1);
    return true;
  });

  // Transform to SearchResult format
  const results: SearchResult[] = limitedTags.map(({ tag, score }) => ({
    id: `tag:${tag.contentType}:${tag.slug}`,
    type: "tag" as const,
    title: formatTagTitle(tag),
    description: `${tag.count} ${tag.contentType === "books" ? "books" : tag.contentType === "blog" ? "posts" : "items"}`,
    url: tag.url,
    score,
  }));

  // Cache results
  ServerCacheInstance.setSearchResults("tags", sanitizedQuery, results);

  return results;
}
