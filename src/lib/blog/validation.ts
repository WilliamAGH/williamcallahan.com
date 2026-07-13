/**
 * Blog Post Validation
 *
 * Validates blog post data to ensure all required fields are present
 * and properly formatted before processing or display.
 */

import type { BlogPost } from "../../types/blog";

const REQUIRED_FIELDS = ["title", "slug", "excerpt", "publishedAt", "author", "tags"] as const;
const VALID_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,198}[a-z0-9]$|^[a-z0-9]$/;

/** Reject path-like and high-cardinality values before blog lookup or route caching. */
export function isValidBlogSlug(slug: string): boolean {
  return VALID_SLUG_PATTERN.test(slug) && !slug.includes("--");
}

/**
 * Validates a blog post object
 *
 * @param {BlogPost} post - The blog post to validate
 * @returns {{ valid: boolean; errors: string[] }} Validation result with any error messages
 */
export function validatePost(post: BlogPost): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (!post[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate slug format
  if (post.slug && !isValidBlogSlug(post.slug)) {
    errors.push("Invalid slug format. Use lowercase letters, numbers, and hyphens only.");
  }

  // Validate date format
  if (post.publishedAt && Number.isNaN(Date.parse(post.publishedAt))) {
    errors.push("Invalid publishedAt date format");
  }

  // Validate tags
  if (post.tags && (!Array.isArray(post.tags) || post.tags.length === 0)) {
    errors.push("Tags must be a non-empty array");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
