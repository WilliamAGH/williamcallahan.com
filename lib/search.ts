/**
 * Search Utilities
 */

import { posts } from "../data/blog/posts";
import { certifications, education } from "../data/education";
import { experiences } from "../data/experience";
import { investments } from "../data/investments";
import type { BlogPost } from "../types/blog";
import type { SearchResult } from "../types/search";
import MiniSearch from "minisearch";
import { ServerCacheInstance } from "./server-cache";
import { sanitizeSearchQuery } from "./validators/search";
import { prepareDocumentsForIndexing } from "./utils/search-helpers";

// --- MiniSearch Index Management ---

// MiniSearch indexes for static data (created once on first use)
let postsIndex: MiniSearch<BlogPost> | null = null;
let investmentsIndex: MiniSearch<typeof investments[0]> | null = null;
let experienceIndex: MiniSearch<typeof experiences[0]> | null = null;
type EducationItem = {
  id: string;
  label: string;
  description: string;
  path: string;
};

type BookmarkIndexItem = {
  id: string;
  title: string;
  description: string;
  tags: string;
  url: string;
  content?: {
    author?: string | null;
    publisher?: string | null;
  };
};

let educationIndex: MiniSearch<EducationItem> | null = null;

// Dynamic bookmark index (updated when bookmarks are fetched)
let bookmarksIndex: MiniSearch<BookmarkIndexItem> | null = null;
let bookmarksIndexTimestamp = 0;
const BOOKMARK_INDEX_TTL = 5 * 60 * 1000; // 5 minutes cache

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
  miniSearchIndex?: MiniSearch<T> | null
): T[] {
  // Sanitize the query first
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) return items;

  // If we have a MiniSearch index, use it for fuzzy search
  if (miniSearchIndex) {
    try {
      const searchResults = miniSearchIndex.search(sanitizedQuery, {
        prefix: true, // Allow prefix matching for autocomplete-like behavior
        fuzzy: 0.1,   // Allow minimal typos (10% edit distance)
        boost: {      // Boost exact matches
          exactMatch: 2
        },
        combineWith: 'AND' // All terms must match
      });
      
      // Map search results back to original items
      const resultIds = new Set(searchResults.map(r => String(r.id)));
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
  if (!postsIndex) {
    postsIndex = new MiniSearch<BlogPost>({
      fields: ['title', 'excerpt', 'tags', 'authorName'], // Fields to index
      storeFields: ['id', 'title', 'excerpt', 'slug', 'publishedAt'], // Fields to return with results
      idField: 'slug', // Unique identifier
      searchOptions: {
        boost: { title: 2 }, // Title matches are more important
        fuzzy: 0.1,
        prefix: true
      },
      extractField: (document, fieldName) => {
        // Handle virtual fields and array conversions
        if (fieldName === 'authorName') {
          return document.author?.name || '';
        }
        if (fieldName === 'tags') {
          return Array.isArray(document.tags) ? document.tags.join(' ') : '';
        }
        // Default field extraction
        const field = fieldName as keyof BlogPost;
        const value = document[field];
        return typeof value === 'string' ? value : '';
      }
    });

    // Deduplicate posts by slug before adding to index
    const dedupedPosts = prepareDocumentsForIndexing(posts, 'Blog Posts', (post) => post.slug);
    
    // Add posts directly - virtual fields are handled by extractField
    postsIndex.addAll(dedupedPosts);
  }
  return postsIndex;
}

export function searchPosts(query: string): BlogPost[] {
  // Check cache first
  const cached = ServerCacheInstance.getSearchResults<BlogPost>('posts', query);
  if (cached && !ServerCacheInstance.shouldRefreshSearch('posts', query)) {
    return cached.results;
  }

  const results = searchContent(
    posts,
    query,
    (post) => [
      post.title || "",
      post.excerpt || "",
      ...(post.tags || []),
      post.author?.name || "",
    ],
    (post) => post.title,
    getPostsIndex()
  );
  
  const sortedResults = results.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  
  // Cache the results
  ServerCacheInstance.setSearchResults('posts', query, sortedResults);
  
  return sortedResults;
}

function getInvestmentsIndex(): MiniSearch<typeof investments[0]> {
  if (!investmentsIndex) {
    investmentsIndex = new MiniSearch<typeof investments[0]>({
      fields: ['name', 'description', 'type', 'status', 'founded_year', 'invested_year', 'acquired_year', 'shutdown_year'],
      storeFields: ['id', 'name', 'description'],
      idField: 'id',
      searchOptions: {
        boost: { name: 2 },
        fuzzy: 0.1,
        prefix: true
      }
    });

    // Deduplicate investments by id before adding to index
    const dedupedInvestments = prepareDocumentsForIndexing(investments, 'Investments');
    investmentsIndex.addAll(dedupedInvestments);
  }
  return investmentsIndex;
}

export function searchInvestments(query: string): SearchResult[] {
  // Check cache first
  const cached = ServerCacheInstance.getSearchResults<SearchResult>('investments', query);
  if (cached && !ServerCacheInstance.shouldRefreshSearch('investments', query)) {
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
    getInvestmentsIndex()
  );

  const searchResults = results.map((inv) => ({
    label: inv.name,
    description: inv.description,
    path: `/investments#${inv.id}`,
  }));

  // Cache the results
  ServerCacheInstance.setSearchResults('investments', query, searchResults);
  
  return searchResults;
}

function getExperienceIndex(): MiniSearch<typeof experiences[0]> {
  if (!experienceIndex) {
    experienceIndex = new MiniSearch<typeof experiences[0]>({
      fields: ['company', 'role', 'period'],
      storeFields: ['id', 'company', 'role'],
      idField: 'id',
      searchOptions: {
        boost: { company: 2, role: 1.5 },
        fuzzy: 0.2,
        prefix: true
      }
    });

    // Deduplicate experiences by id before adding to index
    const dedupedExperiences = prepareDocumentsForIndexing(experiences, 'Experience');
    experienceIndex.addAll(dedupedExperiences);
  }
  return experienceIndex;
}

export function searchExperience(query: string): SearchResult[] {
  // Check cache first
  const cached = ServerCacheInstance.getSearchResults<SearchResult>('experience', query);
  if (cached && !ServerCacheInstance.shouldRefreshSearch('experience', query)) {
    return cached.results;
  }

  const results = searchContent(
    experiences,
    query,
    (exp) => [exp.company, exp.role, exp.period],
    (exp) => exp.company,
    getExperienceIndex()
  );

  const searchResults = results.map((exp) => ({
    label: exp.company,
    description: exp.role,
    path: `/experience#${exp.id}`,
  }));

  // Cache the results
  ServerCacheInstance.setSearchResults('experience', query, searchResults);
  
  return searchResults;
}

function getEducationIndex(): MiniSearch<EducationItem> {
  if (!educationIndex) {
    educationIndex = new MiniSearch({
      fields: ['label', 'description'],
      storeFields: ['id', 'label', 'description', 'path'],
      idField: 'id',
      searchOptions: {
        boost: { label: 2 },
        fuzzy: 0.2,
        prefix: true
      }
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
    const dedupedEducationItems = prepareDocumentsForIndexing(allEducationItems, 'Education');
    educationIndex.addAll(dedupedEducationItems);
  }
  return educationIndex;
}

export function searchEducation(query: string): SearchResult[] {
  // Check cache first
  const cached = ServerCacheInstance.getSearchResults<SearchResult>('education', query);
  if (cached && !ServerCacheInstance.shouldRefreshSearch('education', query)) {
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
    getEducationIndex()
  );

  // Remove the temporary searchableText field
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const searchResults = results.map(({ searchableText: _searchableText, ...item }) => item);
  
  // Cache the results
  ServerCacheInstance.setSearchResults('education', query, searchResults);
  
  return searchResults;
}

export async function searchBookmarks(query: string): Promise<SearchResult[]> {
  try {
    // Check cache first - for bookmarks we use a shorter cache duration since they're dynamic
    const cached = ServerCacheInstance.getSearchResults<SearchResult>('bookmarks', query);
    if (cached && !ServerCacheInstance.shouldRefreshSearch('bookmarks', query)) {
      return cached.results;
    }

    // Fetch bookmark data via the API so that no server-only modules are bundled in client builds
    const { getBaseUrl } = await import("@/lib/getBaseUrl");
    const apiUrl = `${getBaseUrl()}/api/bookmarks`;

    // Abort the request if it hangs >5 s to keep site-wide search snappy
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
      console.error(`[searchBookmarks] Failed API call: ${resp.status}`);
      return cached?.results || [];
    }

    // API can return either an array or an object with a data/bookmarks field
    const raw = await resp.json() as unknown;
    
    let bookmarksData: unknown;
    if (Array.isArray(raw)) {
      bookmarksData = raw;
    } else if (typeof raw === 'object' && raw !== null) {
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

    if (!Array.isArray(bookmarks) || bookmarks.length === 0) return [];

    // Lazy slug generator (memoised)
    const { generateUniqueSlug } = await import("@/lib/utils/domain-utils");
    const slugMap = new Map<string, string>();
    const slugFor = (b: typeof bookmarks[number]): string => {
      const cached = slugMap.get(b.id);
      if (cached) return cached;
      const g = generateUniqueSlug(b.url, bookmarks, b.id);
      slugMap.set(b.id, g);
      return g;
    };

    // No query?  Return every bookmark as SearchResult
    if (!query) {
      return bookmarks.map((b) => ({
        label: b.title || b.url,
        description: b.description || "",
        path: `/bookmarks/${slugFor(b)}`,
      }));
    }

    // Build or update bookmark index if needed
    const now = Date.now();
    if (!bookmarksIndex || now - bookmarksIndexTimestamp > BOOKMARK_INDEX_TTL) {
      bookmarksIndex = new MiniSearch<BookmarkIndexItem>({
        fields: ['title', 'description', 'tags', 'url', 'content.author', 'content.publisher'],
        storeFields: ['id', 'title', 'description', 'url'],
        idField: 'id',
        searchOptions: {
          boost: { title: 2, description: 1.5 },
          fuzzy: 0.2,
          prefix: true
        },
        extractField: (document, fieldName) => {
          // Handle nested content fields
          if (fieldName === 'content.author') {
            return document.content?.author || '';
          }
          if (fieldName === 'content.publisher') {
            return document.content?.publisher || '';
          }
          // Default field extraction
          const field = fieldName as keyof BookmarkIndexItem;
          const value = document[field];
          return typeof value === 'string' ? value : '';
        }
      });

      // Transform bookmarks for indexing
      const bookmarksForIndex: BookmarkIndexItem[] = bookmarks.map(b => ({
        id: b.id,
        title: b.title || b.url,
        description: b.description || '',
        tags: Array.isArray(b.tags) 
          ? b.tags.map(t => typeof t === 'string' ? t : t?.name || '').join(' ')
          : '',
        url: b.url,
        content: b.content ? {
          author: b.content.author,
          publisher: b.content.publisher
        } : undefined
      }));

      // Deduplicate bookmarks by id before adding to index
      const dedupedBookmarks = prepareDocumentsForIndexing(bookmarksForIndex, 'Bookmarks');
      bookmarksIndex.addAll(dedupedBookmarks);
      bookmarksIndexTimestamp = now;
    }

    const filteredBookmarks = searchContent(
      bookmarks,
      query,
      (b) => {
        const tagWords = Array.isArray(b.tags)
          ? b.tags
              .map((t) => {
                if (typeof t === "string") return t;
                const tagObj = t as { name?: string };
                return tagObj.name ?? "";
              })
              .filter(Boolean)
          : [];
        
        return [
          b.title || "",
          b.description || "",
          ...tagWords,
          (b.content as { author?: string | null; publisher?: string | null } | undefined)?.author || "",
          (b.content as { author?: string | null; publisher?: string | null } | undefined)?.publisher || "",
          b.url || "",
        ];
      },
      (b) => b.title || b.url, // Exact match on title
      bookmarksIndex as MiniSearch<unknown> | null
    );

    const results = filteredBookmarks.map((b) => ({
      label: b.title || b.url,
      description: b.description || "",
      path: `/bookmarks/${slugFor(b)}`,
    }));

    // Cache the results
    ServerCacheInstance.setSearchResults('bookmarks', query, results);

    return results;
  } catch (err) {
    console.error("[searchBookmarks] Unexpected failure:", err);
    // Return cached results if available on error
    const cached = ServerCacheInstance.getSearchResults<SearchResult>('bookmarks', query);
    return cached?.results || [];
  }
}
