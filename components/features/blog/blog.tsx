/* Blog Page Component
 *
 * Responsive Layout Strategy:
 * - Container uses max-w-5xl with responsive padding (px-4 sm:px-6)
 * - Header area uses reduced padding on mobile (p-3 sm:p-4)
 * - Content area uses reduced padding on mobile (p-3 sm:p-6)
 * - Title uses font-mono with potential overflow handling for long tag paths
 */

'use client';

import { BlogList } from './blog-list';
import { WindowControls } from '@/components/ui/navigation/windowControls';
import type { BlogPost } from '@/types/blog';

interface BlogProps {
  tag?: string;
  posts: BlogPost[];
}

export function Blog({ tag, posts }: BlogProps) {
  return (
    <div className="max-w-6xl mx-auto mt-8 px-2 sm:px-4 md:px-6">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-3 sm:p-4">
          <div className="flex items-center overflow-hidden">
            <WindowControls />
            <h1 className="text-base sm:text-lg md:text-xl font-mono ml-4 truncate">{tag ? `~/blog/tags/${tag}` : '~/blog'}</h1>
          </div>
        </div>

        <div className="p-3 sm:p-6">
          <BlogList posts={posts} />
        </div>
      </div>
    </div>
  );
}
