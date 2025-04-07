/**
 * Blog Page Component
 */

import { getAllPosts } from '@/lib/blog';
import { BlogList } from './blog-list';
import { WindowControls } from '@/components/ui/navigation/window-controls';
import { Suspense } from 'react';

function BlogSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="bg-gray-200 dark:bg-gray-700 h-32 rounded-lg" />
      ))}
    </div>
  );
}

async function BlogContent() {
  const posts = await getAllPosts();

  if (!posts || posts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-600 dark:text-gray-400">
        <p>No blog posts found.</p>
      </div>
    );
  }

  return <BlogList posts={posts} />;
}

export async function Blog() {
  return (
    <div className="max-w-5xl mx-auto mt-8">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4">
          <div className="flex items-center">
            <WindowControls />
            <h1 className="text-xl font-mono ml-4">~/blog</h1>
          </div>
        </div>

        <div className="p-6">
          <Suspense fallback={<BlogSkeleton />}>
            <BlogContent />
          </Suspense>
        </div>
      </div>
    </div>
  );
}