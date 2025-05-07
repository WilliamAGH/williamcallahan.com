/**
 * Blog Card Component
 *
 * Displays a preview of a blog post with cover image, title, excerpt, and metadata.
 *
 * @component
 * @param {Object} props
 * @param {BlogPost} props.post - The blog post to display
 * @param {boolean} props.isPriority - Optional priority flag
 */

import Link from 'next/link';
import Image from 'next/image';
import { Calendar } from 'lucide-react';
import { BlogTags } from '../shared/blog-tags';
import { formatDate } from '@/lib/utils';
import type { BlogPost } from '@/types/blog';

interface BlogCardProps {
  post: BlogPost;
  isPriority?: boolean;
}

export function BlogCard({ post, isPriority = false }: BlogCardProps) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="block group h-full"
    >
      <article className="flex flex-col h-full rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-50 dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-700 transition-all duration-200">
        {post.coverImage && typeof post.coverImage === 'string' && post.coverImage.trim() !== '' && (
          <div className="relative h-48 w-full overflow-hidden bg-gray-100 dark:bg-gray-800">
            <Image
              src={post.coverImage}
              alt={post.title}
              fill
              priority={isPriority}
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </div>
        )}

        <div className="flex flex-col flex-grow p-6">
          <BlogTags tags={post.tags} interactive={false} />

          <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
            {post.title}
          </h2>

          <p className="text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
            {post.excerpt}
          </p>

          <div className="mt-auto flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-4">
              <span className="flex items-center">
                <Calendar className="w-4 h-4 mr-1" />
                {formatDate(post.publishedAt)}
              </span>
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}
