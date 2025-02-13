/**
 * Blog List Component
 *
 * Responsive Layout Strategy:
 * - Uses CSS Grid for card layout
 * - Single column on mobile (< 768px)
 * - Two columns on medium screens and up (>= 768px)
 * - Gap of 1.5rem (gap-6) between cards for consistent spacing
 * - Cards expand to fill available width within their grid cell
 */

import { BlogCard } from './blog-card';
import type { BlogPost } from '../../../types/blog';

interface BlogListProps {
  /** Array of blog posts to display */
  posts: BlogPost[];
}

export function BlogList({ posts }: BlogListProps) {
  return (
    <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
      {posts.map(post => (
        <BlogCard key={post.id} post={post} />
      ))}
    </div>
  );
}
