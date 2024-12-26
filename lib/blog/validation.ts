/**
 * Blog Post Validation
 */

import type { BlogPost } from '@/types/blog';

const REQUIRED_FIELDS = [
  'title',
  'slug',
  'excerpt',
  'publishedAt',
  'author',
  'tags',
  'readingTime'
] as const;

export function validatePost(post: BlogPost): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (!post[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate slug format
  if (post.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug)) {
    errors.push('Invalid slug format. Use lowercase letters, numbers, and hyphens only.');
  }

  // Validate date format
  if (post.publishedAt && Number.isNaN(Date.parse(post.publishedAt))) {
    errors.push('Invalid publishedAt date format');
  }

  // Validate tags
  if (post.tags && (!Array.isArray(post.tags) || post.tags.length === 0)) {
    errors.push('Tags must be a non-empty array');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}