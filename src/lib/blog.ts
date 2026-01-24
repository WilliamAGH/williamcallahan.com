/**
 * Blog Data Management
 */

import { posts as staticPosts } from "@/data/blog/posts";
import type { BlogPost, PostLookupResult, MemoizedLookupResult } from "@/types/blog";
import { getAllMDXPostsCached, getMDXPostCached } from "./blog/mdx";
import { BlogPostDataError } from "./utils/error-utils";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

/** Whether to include draft posts (only in development) */
const INCLUDE_DRAFTS = process.env.NODE_ENV === "development";

/** Directory containing MDX blog posts */
const POSTS_DIRECTORY = path.join(process.cwd(), "data/blog/posts");

/**
 * Valid slug pattern: lowercase alphanumeric with hyphens, 1-200 chars.
 * This prevents path traversal attacks (e.g., "../../../etc/passwd") and
 * limits memory growth from arbitrary slug requests.
 */
const VALID_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,198}[a-z0-9]$|^[a-z0-9]$/;

function isValidSlug(slug: string): boolean {
  return VALID_SLUG_PATTERN.test(slug) && !slug.includes("--");
}

let mdxSlugIndexPromise: Promise<Map<string, { filePath: string }>> | null = null;
const getMdxSlugIndex = async (): Promise<Map<string, { filePath: string }>> => {
  if (mdxSlugIndexPromise) return mdxSlugIndexPromise;

  mdxSlugIndexPromise = (async () => {
    const slugToEntry = new Map<string, { filePath: string }>();

    let files: string[];
    try {
      files = await fs.readdir(POSTS_DIRECTORY);
    } catch (error) {
      console.error(`[getMdxSlugIndex] Failed to read ${POSTS_DIRECTORY}:`, error);
      return slugToEntry;
    }

    for (const fileName of files) {
      if (!fileName.endsWith(".mdx")) continue;
      const filePath = path.join(POSTS_DIRECTORY, fileName);

      try {
        const fileContents = await fs.readFile(filePath, "utf8");
        const parsed = matter(fileContents);
        const data = parsed.data as Record<string, unknown>;
        const slug = typeof data.slug === "string" ? data.slug.trim() : "";
        if (!slug) {
          console.warn(`[getMdxSlugIndex] Missing or invalid slug in ${filePath}. Skipping.`);
          continue;
        }
        if (slugToEntry.has(slug)) {
          console.warn(`[getMdxSlugIndex] Duplicate slug "${slug}" detected. Keeping first, skipping ${filePath}.`);
          continue;
        }
        slugToEntry.set(slug, { filePath });
      } catch (error) {
        console.error(`[getMdxSlugIndex] Failed to index ${filePath}:`, error);
      }
    }

    return slugToEntry;
  })();

  return mdxSlugIndexPromise;
};

// Note: MemoizedLookupResult type is defined later in file (after lookupMdxPost)
// Using deferred type annotation pattern to avoid forward reference
const postBySlugMemo = new Map<
  string,
  Promise<{ status: "found"; post: BlogPost } | { status: "not_found" } | { status: "error"; error: Error }>
>();
const postMetaBySlugMemo = new Map<
  string,
  Promise<{ status: "found"; post: BlogPost } | { status: "not_found" } | { status: "error"; error: Error }>
>();

/**
 * Short-lived negative cache for not-found slugs.
 *
 * Why: We intentionally avoid permanently memoizing not-found results to prevent unbounded memory growth from arbitrary
 * slug requests. However, under high-traffic 404s, clearing the in-flight promise immediately after resolution causes
 * repeated filesystem work. This bounded TTL cache reduces duplicate work while keeping memory growth controlled.
 */
const NOT_FOUND_SLUG_NEGATIVE_CACHE_TTL_MS = 30_000;
const NOT_FOUND_SLUG_NEGATIVE_CACHE_MAX_ENTRIES = 500;
const notFoundSlugUntilMs = new Map<string, number>();

function isNegativelyCachedNotFoundSlug(slug: string): boolean {
  const untilMs = notFoundSlugUntilMs.get(slug);
  if (!untilMs) return false;

  const nowMs = Date.now();
  if (untilMs <= nowMs) {
    notFoundSlugUntilMs.delete(slug);
    return false;
  }

  return true;
}

function setNegativelyCachedNotFoundSlug(slug: string): void {
  notFoundSlugUntilMs.set(slug, Date.now() + NOT_FOUND_SLUG_NEGATIVE_CACHE_TTL_MS);

  if (notFoundSlugUntilMs.size <= NOT_FOUND_SLUG_NEGATIVE_CACHE_MAX_ENTRIES) return;

  const oldestKey = notFoundSlugUntilMs.keys().next().value;
  if (typeof oldestKey === "string") notFoundSlugUntilMs.delete(oldestKey);
}

/**
 * Clears the process-level memoization caches for blog posts.
 * Should be called when blog cache is invalidated to prevent stale data
 * in long-running processes.
 */
export function clearBlogSlugMemos(): void {
  postBySlugMemo.clear();
  postMetaBySlugMemo.clear();
  mdxSlugIndexPromise = null;
  notFoundSlugUntilMs.clear();
  console.log("[Blog] Cleared process-level slug memoization caches");
}

/**
 * Internal lookup for MDX posts by slug. Assumes slug is pre-validated.
 *
 * @returns A discriminated union that clearly distinguishes between:
 *   - Post found successfully
 *   - Post not found (no matching slug in filesystem or index)
 *   - Error during lookup (file access error, parsing error, etc.)
 */
async function lookupMdxPost(slug: string, skipHeavyProcessing: boolean): Promise<PostLookupResult> {
  try {
    // Optimization: try the conventional path first (filename === slug)
    const directFilePath = path.join(POSTS_DIRECTORY, `${slug}.mdx`);
    const directPost = await getMDXPostCached(slug, directFilePath, undefined, skipHeavyProcessing);
    if (directPost) return { found: true, post: directPost };

    // Fallback: resolve slug via frontmatter index (handles slug !== filename)
    const mdxIndex = await getMdxSlugIndex();
    const entry = mdxIndex.get(slug);
    if (!entry) return { found: false, reason: "not_found" };

    const indexedPost = await getMDXPostCached(slug, entry.filePath, undefined, skipHeavyProcessing);
    if (indexedPost) return { found: true, post: indexedPost };

    // File existed in index but getMDXPostCached returned null (parsing/validation failed)
    return { found: false, reason: "not_found" };
  } catch (error) {
    // Unexpected error during lookup - preserve for caller to handle
    return {
      found: false,
      reason: "error",
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Core memoized post lookup. Extracts common pattern used by both
 * getPostBySlug and getPostMetaBySlug to eliminate duplication.
 *
 * @param slug - The post slug (must be pre-validated by caller)
 * @param memo - The memoization map to use
 * @param skipHeavyProcessing - Whether to skip MDX serialization/blur
 * @param fnName - Function name for logging
 * @returns Discriminated union with explicit status for found/not_found/error cases
 */
async function memoizedPostLookup(
  slug: string,
  memo: Map<string, Promise<MemoizedLookupResult>>,
  skipHeavyProcessing: boolean,
  fnName: string,
): Promise<MemoizedLookupResult> {
  const memoized = memo.get(slug);
  if (memoized) return memoized;

  if (isNegativelyCachedNotFoundSlug(slug)) return Promise.resolve({ status: "not_found" });

  const promise = (async (): Promise<MemoizedLookupResult> => {
    // Prefer static posts first (fast path)
    const staticMatch = staticPosts?.find(post => post.slug === slug);
    if (staticMatch) return { status: "found", post: staticMatch };

    const result = await lookupMdxPost(slug, skipHeavyProcessing);

    if (result.found) {
      return { status: "found", post: result.post };
    }

    if (result.reason === "error") {
      console.error(`[${fnName}] Error during lookup for slug "${slug}":`, result.error);
      // Don't memoize error results - allow retry on next request
      memo.delete(slug);
      console.log(`[${fnName}] Cleared memo for slug "${slug}" due to lookup error`);
      return { status: "error", error: result.error };
    }

    // Not found case - bounded, short-lived negative cache to reduce repeated filesystem work under high-traffic 404s.
    console.log(`[${fnName}] Blog post not found with slug: ${slug}`);
    setNegativelyCachedNotFoundSlug(slug);
    memo.delete(slug);
    return { status: "not_found" };
  })().catch((error): MemoizedLookupResult => {
    // Unexpected error - clear memo and return error result
    memo.delete(slug);
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    console.error(`[${fnName}] Unexpected error for slug "${slug}", memo cleared:`, normalizedError);
    return { status: "error", error: normalizedError };
  });

  memo.set(slug, promise);
  return promise;
}

/**
 * Retrieves all blog posts sorted by publish date.
 * Draft posts are excluded in production but visible in development.
 *
 * @param includeDrafts - Override to include drafts regardless of environment (for admin use)
 * @param skipHeavyProcessing - Skip MDX serialization and blur generation (for lists/sitemaps)
 * @throws Error if the posts cannot be retrieved
 */
export async function getAllPosts(includeDrafts = INCLUDE_DRAFTS, skipHeavyProcessing = false): Promise<BlogPost[]> {
  try {
    // Get posts from both sources
    const mdxPosts = await getAllMDXPostsCached(skipHeavyProcessing);

    // Check for empty static posts (unlikely but defensive)
    if (!staticPosts || !Array.isArray(staticPosts)) {
      console.warn("Static posts array is empty or invalid");
    }

    // Combine posts from both sources
    const allPosts = [...(staticPosts || []), ...mdxPosts];

    // Filter out drafts unless explicitly included
    const visiblePosts = includeDrafts ? allPosts : allPosts.filter(post => !post.draft);

    // Sort by date, newest first
    return visiblePosts.toSorted((a, b) => {
      const dateA = new Date(a.publishedAt || 0).getTime();
      const dateB = new Date(b.publishedAt || 0).getTime();
      return dateB - dateA;
    });
  } catch (error) {
    // We're explicitly logging the error here to ensure it's visible,
    // but then we're re-throwing it to propagate up to the API handler
    console.error("[getAllPosts] Error retrieving blog posts:", error);
    throw error; // Re-throw to allow API layer to handle error response
  }
}

/**
 * Retrieves metadata for all blog posts (skips heavy processing).
 * Useful for sitemaps, static params, and lists.
 */
export async function getAllPostsMeta(includeDrafts = INCLUDE_DRAFTS): Promise<BlogPost[]> {
  return getAllPosts(includeDrafts, true);
}

/**
 * Retrieves lightweight metadata for a single blog post by slug (skips MDX compilation + blur generation).
 * Prefer this for `generateMetadata()` and other SEO-only contexts.
 *
 * Note: Successful lookups are memoized; not-found slugs are cached briefly (bounded) to reduce repeated 404 work while
 * keeping memory growth controlled.
 *
 * @param slug - The blog post slug to look up
 * @returns The blog post if found, null if not found or invalid slug
 * @throws BlogPostDataError if an unexpected error occurs during lookup
 */
export async function getPostMetaBySlug(slug: string): Promise<BlogPost | null> {
  // Security: validate slug to prevent path traversal and limit memory growth
  if (!isValidSlug(slug)) {
    console.warn(`[getPostMetaBySlug] Invalid slug rejected: "${slug}"`);
    return null;
  }

  const result = await memoizedPostLookup(slug, postMetaBySlugMemo, true, "getPostMetaBySlug");

  switch (result.status) {
    case "found":
      return result.post;
    case "not_found":
      return null;
    case "error":
      // For metadata lookups, we typically want to fail gracefully for SEO contexts
      // Log but return null to avoid breaking page generation
      console.error(`[getPostMetaBySlug] Returning null due to error for slug "${slug}":`, result.error);
      return null;
  }
}

/**
 * Retrieves a single blog post by its slug (includes full MDX content).
 * Includes draft posts since direct URL access is allowed.
 *
 * Note: Successful lookups are memoized; not-found slugs are cached briefly (bounded) to reduce repeated 404 work while
 * keeping memory growth controlled.
 *
 * @param slug - The blog post slug to look up
 * @returns The found blog post or null if not found (including invalid slugs)
 * @throws BlogPostDataError for unexpected errors during post retrieval (file access, parsing, etc.)
 */
export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  // Security: validate slug to prevent path traversal and limit memory growth
  if (!isValidSlug(slug)) {
    console.warn(`[getPostBySlug] Invalid slug rejected: "${slug}"`);
    return null;
  }

  const result = await memoizedPostLookup(slug, postBySlugMemo, false, "getPostBySlug");

  switch (result.status) {
    case "found":
      return result.post;
    case "not_found":
      return null;
    case "error":
      // For full post retrieval, propagate errors to allow API layer to handle
      throw new BlogPostDataError(`Error retrieving blog post "${slug}": ${result.error.message}`, slug, result.error);
  }
}

/**
 * Retrieves all unique tags from blog posts
 *
 * @throws Error if the tags cannot be retrieved
 */
export async function getAllTags(): Promise<string[]> {
  try {
    const posts = await getAllPosts();

    // Filter out posts with no tags and flatten the array
    const allTags = posts.filter(post => post.tags && Array.isArray(post.tags)).flatMap(post => post.tags);

    // Create a set to remove duplicates
    const tags = new Set(allTags);
    return Array.from(tags).toSorted();
  } catch (error) {
    console.error("[getAllTags] Error retrieving blog tags:", error);
    throw error;
  }
}
