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

import { formatDate } from "@/lib/utils";
import { Calendar } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { BlogTagsExpandable } from "../shared/blog-tags-expandable.client";

import type { BlogCardPropsExtended } from "@/types/features";

// Use extended props from centralized types

export function BlogCard({ post, isPriority = false }: BlogCardPropsExtended) {
  return (
    <article className="group flex flex-col h-full rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-50 dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-700 transition-all duration-200">
      {post.coverImage && typeof post.coverImage === "string" && post.coverImage.trim() !== "" && (
        <Link
          href={`/blog/${post.slug}`}
          className="relative h-48 w-full overflow-hidden bg-gray-100 dark:bg-gray-800 block cursor-pointer"
        >
          <Image
            src={post.coverImage}
            alt={post.title}
            fill
            priority={isPriority}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </Link>
      )}

      <div className="flex flex-col flex-grow p-6">
        <h2 className="text-xl font-semibold mb-3">
          <Link
            href={`/blog/${post.slug}`}
            className="text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer inline-block"
          >
            {post.title}
          </Link>
        </h2>

        {/* Tags are interactive and clickable */}
        <BlogTagsExpandable tags={post.tags} interactive={true} />

        <p className="text-gray-600 dark:text-gray-400 mb-4 line-clamp-2 mt-3">{post.excerpt}</p>

        <div className="mt-auto flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center">
              <Calendar className="w-4 h-4 mr-1" />
              <span suppressHydrationWarning>{formatDate(post.publishedAt)}</span>
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
