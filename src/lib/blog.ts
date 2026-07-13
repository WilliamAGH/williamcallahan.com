import type {
  BlogPost,
  PostLookupResult,
  MemoizedLookupResult,
  MemoizedLookupParams,
} from "@/types/blog";
import { getAllMDXPostsCached, getMDXPostCached } from "./blog/mdx";
import { BlogPostDataError } from "./utils/error-utils";
import { getMonotonicTime } from "@/lib/utils";
import {
  clearBlogPostFilePathIndex,
  findBlogPostFilePath,
  isValidBlogSlug,
} from "./blog/validation";

/** Whether to include draft posts (only in development) */
const INCLUDE_DRAFTS = process.env.NODE_ENV === "development";

const postBySlugMemo = new Map<string, Promise<MemoizedLookupResult>>();
const postMetaBySlugMemo = new Map<string, Promise<MemoizedLookupResult>>();

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

  const nowMs = getMonotonicTime();
  if (untilMs <= nowMs) {
    notFoundSlugUntilMs.delete(slug);
    return false;
  }

  return true;
}

function setNegativelyCachedNotFoundSlug(slug: string): void {
  notFoundSlugUntilMs.set(slug, getMonotonicTime() + NOT_FOUND_SLUG_NEGATIVE_CACHE_TTL_MS);

  if (notFoundSlugUntilMs.size <= NOT_FOUND_SLUG_NEGATIVE_CACHE_MAX_ENTRIES) return;

  // Safe: all entries share the same TTL, so insertion order === expiration order (FIFO eviction)
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
  clearBlogPostFilePathIndex();
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
async function lookupMdxPost(
  slug: string,
  skipHeavyProcessing: boolean,
): Promise<PostLookupResult> {
  try {
    const filePath = await findBlogPostFilePath(slug);
    if (!filePath) return { found: false, reason: "not_found" };

    const post = await getMDXPostCached(slug, filePath, undefined, skipHeavyProcessing);
    if (post) return { found: true, post };

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
 * @returns Discriminated union with explicit status for found/not_found/error cases
 */
async function memoizedPostLookup({
  slug,
  memo,
  skipHeavyProcessing,
  fnName,
}: MemoizedLookupParams): Promise<MemoizedLookupResult> {
  const memoized = memo.get(slug);
  if (memoized) return memoized;

  if (isNegativelyCachedNotFoundSlug(slug)) return Promise.resolve({ status: "not_found" });

  const promise = (async (): Promise<MemoizedLookupResult> => {
    const result = await lookupMdxPost(slug, skipHeavyProcessing);

    if (result.found) {
      return { status: "found", post: result.post };
    }

    if ("error" in result) {
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
    console.error(
      `[${fnName}] Unexpected error for slug "${slug}", memo cleared:`,
      normalizedError,
    );
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
export async function getAllPosts(
  includeDrafts = INCLUDE_DRAFTS,
  skipHeavyProcessing = false,
): Promise<BlogPost[]> {
  const posts = await getAllMDXPostsCached(skipHeavyProcessing);
  const visiblePosts = includeDrafts ? posts : posts.filter((post) => !post.draft);

  return visiblePosts.toSorted(
    (left, right) => new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime(),
  );
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
  if (!isValidBlogSlug(slug)) {
    console.warn(`[getPostMetaBySlug] Invalid slug rejected: "${slug}"`);
    return null;
  }

  const result = await memoizedPostLookup({
    slug,
    memo: postMetaBySlugMemo,
    skipHeavyProcessing: true,
    fnName: "getPostMetaBySlug",
  });

  switch (result.status) {
    case "found":
      return result.post;
    case "not_found":
      return null;
    case "error":
      // For metadata lookups, we typically want to fail gracefully for SEO contexts
      // Log but return null to avoid breaking page generation
      console.error(
        `[getPostMetaBySlug] Returning null due to error for slug "${slug}":`,
        result.error,
      );
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
  if (!isValidBlogSlug(slug)) {
    console.warn(`[getPostBySlug] Invalid slug rejected: "${slug}"`);
    return null;
  }

  const result = await memoizedPostLookup({
    slug,
    memo: postBySlugMemo,
    skipHeavyProcessing: false,
    fnName: "getPostBySlug",
  });

  switch (result.status) {
    case "found":
      return result.post;
    case "not_found":
      return null;
    case "error":
      // For full post retrieval, propagate errors to allow API layer to handle
      throw new BlogPostDataError(
        `Error retrieving blog post "${slug}": ${result.error.message}`,
        slug,
        result.error,
      );
  }
}

/**
 * Retrieves all unique tags from blog posts
 *
 * @throws Error if the tags cannot be retrieved
 */
export async function getAllTags(): Promise<string[]> {
  const posts = await getAllPostsMeta();
  return Array.from(new Set(posts.flatMap((post) => post.tags))).toSorted();
}
