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
import { TerminalSearchHint } from "@/components/ui/terminal/terminal-search-hint";

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
    <div className="space-y-6">
      {/* Header row: article count + search hint */}
      <div className="flex items-center justify-between">
        <p className="text-gray-500 dark:text-gray-400">
          {posts.length} {posts.length === 1 ? "article" : "articles"}
        </p>
        <TerminalSearchHint context="blog" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {posts.map((post, index) => (
          <BlogCard key={post.slug} post={post} preload={index < 2} />
        ))}
      </div>
    </div>
  );
}
