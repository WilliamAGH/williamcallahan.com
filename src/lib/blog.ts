/**
 * Blog Data Management
 */

import { posts as staticPosts } from "@/data/blog/posts";
import type { BlogPost } from "@/types/blog";
import { getAllMDXPostsCached, getMDXPostCached } from "./blog/mdx";
import { BlogPostDataError } from "./utils/error-utils";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

/** Whether to include draft posts (only in development) */
const INCLUDE_DRAFTS = process.env.NODE_ENV === "development";

/** Directory containing MDX blog posts */
const POSTS_DIRECTORY = path.join(process.cwd(), "data/blog/posts");

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

const postBySlugMemo = new Map<string, Promise<BlogPost | null>>();
const postMetaBySlugMemo = new Map<string, Promise<BlogPost | null>>();

async function getPostBySlugInternal(slug: string, skipHeavyProcessing: boolean): Promise<BlogPost | null> {
  // Optimization: try the conventional path first (filename === slug)
  const directFilePath = path.join(POSTS_DIRECTORY, `${slug}.mdx`);
  const directPost = await getMDXPostCached(slug, directFilePath, undefined, skipHeavyProcessing);
  if (directPost) return directPost;

  // Fallback: resolve slug via frontmatter index (handles slug !== filename)
  const mdxIndex = await getMdxSlugIndex();
  const entry = mdxIndex.get(slug);
  if (!entry) return null;

  return getMDXPostCached(slug, entry.filePath, undefined, skipHeavyProcessing);
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
 */
export async function getPostMetaBySlug(slug: string): Promise<BlogPost | null> {
  if (!slug) {
    console.warn("Blog post slug is empty or undefined");
    return null;
  }

  const memoized = postMetaBySlugMemo.get(slug);
  if (memoized) return memoized;

  const promise = (async (): Promise<BlogPost | null> => {
    // Prefer static posts first (fast path)
    const staticMatch = staticPosts?.find(post => post.slug === slug);
    if (staticMatch) return staticMatch;

    const post = await getPostBySlugInternal(slug, true);
    if (!post) {
      console.log(`[getPostMetaBySlug] Blog post not found with slug: ${slug}`);
      return null;
    }
    return post;
  })().catch(error => {
    postMetaBySlugMemo.delete(slug);
    throw error;
  });

  postMetaBySlugMemo.set(slug, promise);
  return promise;
}

/**
 * Retrieves a single blog post by its slug.
 * Includes draft posts since direct URL access is allowed.
 *
 * @returns The found blog post or null if not found
 * @throws BlogPostDataError only for unexpected errors, not for missing posts
 */
export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  if (!slug) {
    console.warn("Blog post slug is empty or undefined");
    return null;
  }

  const memoized = postBySlugMemo.get(slug);
  if (memoized) return memoized;

  try {
    const promise = (async (): Promise<BlogPost | null> => {
      // Prefer static posts first (fast path)
      const staticMatch = staticPosts?.find(post => post.slug === slug);
      if (staticMatch) return staticMatch;

      const post = await getPostBySlugInternal(slug, false);
      if (!post) {
        console.log(`[getPostBySlug] Blog post not found with slug: ${slug}`);
        return null;
      }
      return post;
    })().catch(error => {
      postBySlugMemo.delete(slug);
      throw error;
    });

    postBySlugMemo.set(slug, promise);
    return await promise;
  } catch (error) {
    // Log the error but don't crash the server
    console.error(`[getPostBySlug] Error retrieving post by slug "${slug}":`, error);

    // For unexpected errors, we still throw to allow API error handling
    if (!(error instanceof BlogPostDataError)) {
      throw new BlogPostDataError(`Error retrieving blog post: ${slug}`, slug, error);
    }
    // If we reach here, error is already a BlogPostDataError, so rethrow it
    throw error;
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
