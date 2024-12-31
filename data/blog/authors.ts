/**
 * Blog Authors
 *
 * Defines the author information for blog posts.
 * Each author is identified by a unique slug and contains
 * their display information.
 */

import type { Author } from '../../types/blog';

/**
 * Map of author slugs to their full information
 */
export const authors: Record<string, Author> = {
  'william-callahan': {
    id: 'william-callahan',
    name: 'William Callahan',
    bio: 'Entrepreneur and investor building the future of financial technology.',
    avatar: '/images/william.jpeg'
  }
};
