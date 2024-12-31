/**
 * Blog List Component
 * Displays a grid of blog post cards
 */

import { BlogCard } from './blog-card';
import type { BlogPost } from '../../../types/blog';

interface BlogListProps {
  /** Array of blog posts to display */
  posts: BlogPost[];
}

export function BlogList({ posts }: BlogListProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {posts.map(post => (
        <div key={post.id}>
          <BlogCard post={post} />
        </div>
      ))}
    </div>
  );
}
