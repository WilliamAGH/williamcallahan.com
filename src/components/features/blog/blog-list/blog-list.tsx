/**
 * Blog List Component
 *
 * Displays a grid of blog post cards with consistent spacing and responsive layout.
 * Uses a 2-column grid on medium screens and above for optimal readability.
 *
 * @component
 * @param {Object} props
 * @param {BlogPost[]} props.posts - Array of blog posts to display
 */

import { BlogCard } from "./blog-card";

import type { BlogListProps } from "@/types/features";

export function BlogList({ posts }: BlogListProps) {
  return (
    <div className="space-y-6">
      {/* Article count */}
      <p className="text-gray-500 dark:text-gray-400">
        {posts.length} {posts.length === 1 ? "article" : "articles"}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {posts.map((post, index) => (
          <BlogCard key={post.id} post={post} preload={index < 2} />
        ))}
      </div>
    </div>
  );
}
