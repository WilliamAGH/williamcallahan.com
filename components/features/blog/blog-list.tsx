/**
 * Blog List Component
 */

import { BlogCard } from './blog-card';
import type { BlogPost } from '@/types/blog';

export function BlogList({ posts }: { posts: BlogPost[] }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {posts.map(post => (
        <BlogCard key={post.id} post={post} />
      ))}
    </div>
  );
}