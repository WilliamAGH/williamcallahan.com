/**
 * @file Blog List Server Component
 * @module components/features/blog/blog-list/blog-list.server
 *
 * @description
 * Server component that pre-renders the blog post list for optimal performance.
 * This component is rendered on the server before being sent to the client,
 * enabling faster initial page loads.
 *
 * @serverComponent - This component should only be used in a server context.
 */

import { BlogCard } from "./blog-card";

import type { JSX } from "react";

import type { BlogListServerProps } from "@/types/features";

/**
 * Server component that renders a grid of blog post cards
 * This component pre-renders on the server for fast initial loading
 *
 * @param {BlogListServerProps} props - Component props
 * @returns {JSX.Element} Server-rendered blog post grid
 */
export function BlogListServer({ posts }: BlogListServerProps): JSX.Element {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {posts.map((post, index) => (
          <BlogCard key={post.slug} post={post} isPriority={index < 2} />
        ))}
      </div>
    </div>
  );
}
