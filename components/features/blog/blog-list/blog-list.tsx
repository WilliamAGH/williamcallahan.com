/**
 * Blog List Component
 * 
 * Displays a grid of blog post cards with consistent spacing and responsive layout.
 * 
 * @component
 * @param {Object} props
 * @param {BlogPost[]} props.posts - Array of blog posts to display
 */

import { BlogCard } from './blog-card';
import type { BlogPost } from '@/types/blog';

interface BlogListProps {
  posts: BlogPost[];
}

export function BlogList({ posts }: BlogListProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {posts.map(post => (
        <BlogCard key={post.id} post={post} />
      ))}
    </div>
  );
}