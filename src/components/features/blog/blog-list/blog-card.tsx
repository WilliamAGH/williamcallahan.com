/**
 * Blog Card Component
 *
 * Displays a preview of a blog post with cover image, title, excerpt, and metadata.
 *
 * @component
 * @param {Object} props
 * @param {BlogPost} props.post - The blog post to display
 * @param {boolean} props.preload - Preload image in document head (Next.js 16+)
 */

import { formatDate } from "@/lib/utils";
import { Calendar } from "lucide-react";
import Link from "next/link";
import { BlogTagsExpandable } from "../shared/blog-tags-expandable.client";
import { OptimizedCardImage } from "@/components/ui/logo-image.client";

import type { BlogCardPropsExtended } from "@/types/features";

export function BlogCard({ post, preload = false }: BlogCardPropsExtended) {
  return (
    <article className="group flex flex-col h-full rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-50 dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-700 transition-all duration-200">
      {post.coverImage && typeof post.coverImage === "string" && post.coverImage.trim() !== "" && (
        <Link
          href={`/blog/${post.slug}`}
          className="relative h-48 w-full overflow-hidden bg-gray-100 dark:bg-gray-800 block cursor-pointer"
          prefetch={false}
        >
          <OptimizedCardImage
            src={post.coverImage}
            alt={post.title}
            className="transition-transform duration-300 group-hover:scale-105"
            preload={preload}
            blurDataURL={post.coverImageBlurDataURL}
          />
        </Link>
      )}

      <div className="flex flex-col flex-grow p-6">
        <h2 className="text-xl font-semibold mb-3">
          <Link
            href={`/blog/${post.slug}`}
            className="text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer inline-block"
            prefetch={false}
          >
            {post.title}
          </Link>
        </h2>

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
