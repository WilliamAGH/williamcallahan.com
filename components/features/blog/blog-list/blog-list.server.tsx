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

import type { BlogPost } from '@/types/blog';
import { BlogCard } from './blog-card';
import { ServerComponent } from '@/types/component-types';

/**
 * Props for the BlogListServer component
 */
interface BlogListServerProps {
  /**
   * Array of blog posts to display
   */
  posts: BlogPost[];
}

/**
 * Server component that renders a grid of blog post cards
 * This component pre-renders on the server for fast initial loading
 *
 * @param {BlogListServerProps} props - Component props
 * @returns {Promise<JSX.Element>} Server-rendered blog post grid
 */
export async function BlogListServer({ posts }: BlogListServerProps): Promise<JSX.Element> {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {posts.map((post) => (
          <BlogCard key={post.slug} post={post} />
        ))}
      </div>
    </div>
  );
}