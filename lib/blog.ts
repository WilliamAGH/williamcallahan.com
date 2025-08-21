/**
 * Blog Data Management
 */

import { posts as staticPosts } from "@/data/blog/posts";
import type { BlogPost } from "@/types/blog";
import { getAllMDXPostsCached } from "./blog/mdx";
import { BlogPostDataError } from "./utils/error-utils";

/**
 * Retrieves all blog posts sorted by publish date
 *
 * @throws Error if the posts cannot be retrieved
 */
export async function getAllPosts(): Promise<BlogPost[]> {
  try {
    // Get posts from both sources
    const mdxPosts = await getAllMDXPostsCached();

    // Check for empty static posts (unlikely but defensive)
    if (!staticPosts || !Array.isArray(staticPosts)) {
      console.warn("Static posts array is empty or invalid");
    }

    // Combine posts from both sources
    const allPosts = [...(staticPosts || []), ...mdxPosts];

    // Sort by date, newest first
    return allPosts.sort((a, b) => {
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
 * Retrieves a single blog post by its slug
 *
 * @returns The found blog post or null if not found
 * @throws BlogPostDataError only for unexpected errors, not for missing posts
 */
export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  if (!slug) {
    console.warn("Blog post slug is empty or undefined");
    return null;
  }

  try {
    // Check static posts first
    // To get a post by slug, we first get all posts (which are cached and use frontmatter slugs)
    // and then find the one with the matching slug.
    // This avoids needing to guess filenames or re-implement file iteration logic here.
    const allPosts = await getAllPosts();
    const foundPost = allPosts.find(post => post.slug === slug);

    if (!foundPost) {
      console.log(`[getPostBySlug] Blog post not found with slug: ${slug}`);
      return null;
    }

    return foundPost;
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
    return Array.from(tags).sort();
  } catch (error) {
    console.error("[getAllTags] Error retrieving blog tags:", error);
    throw error;
  }
}
