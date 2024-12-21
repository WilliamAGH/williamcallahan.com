/**
 * Blog Card Component
 */

import Link from 'next/link';
import Image from 'next/image';
import type { BlogPost } from '@/types/blog';

export function BlogCard({ post }: { post: BlogPost }) {
  return (
    <Link href={`/blog/${post.slug}`} className="block group">
      <article className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-50 dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-700 transition-all duration-200">
        {post.coverImage && (
          <div className="relative h-48 overflow-hidden">
            <Image
              src={post.coverImage}
              alt={post.title}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </div>
        )}
        <div className="p-6">
          <div className="flex items-center gap-2 mb-3">
            {post.tags.map(tag => (
              <span
                key={tag}
                className="px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
              >
                {tag}
              </span>
            ))}
          </div>
          <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
            {post.title}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
            {post.excerpt}
          </p>
          <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-2">
              {post.author.avatar && (
                <Image
                  src={post.author.avatar}
                  alt={post.author.name}
                  width={24}
                  height={24}
                  className="rounded-full"
                />
              )}
              <span>{post.author.name}</span>
            </div>
            <span>{new Date(post.publishedAt).toLocaleDateString()}</span>
          </div>
        </div>
      </article>
    </Link>
  );
}