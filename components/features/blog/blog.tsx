/**
 * Blog Page Component
 */

"use client";

import { useEffect, useState } from 'react';
import { BlogList } from './blog-list';
import { WindowControls } from '@/components/ui/navigation/window-controls';
import type { BlogPost } from '@/types/blog';

export function Blog() {
  const [posts, setPosts] = useState<BlogPost[]>([]);

  useEffect(() => {
    fetch('/api/posts')
      .then(res => res.json())
      .then(data => setPosts(data));
  }, []);

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
          <BlogList posts={posts} />
        </div>
      </div>
    </div>
  );
}