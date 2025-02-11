/**
 * Blog Card Component
 *
 * Responsive Layout Strategy:
 * - Card uses full width of its grid cell
 * - Reduced padding on mobile (p-3) with more space on larger screens (sm:p-6)
 * - Tags use flex-wrap to handle multiple tags responsively
 * - Author/date section uses flex-wrap with gaps for stacking on narrow screens
 * - Images maintain 48px height with object-cover for consistent appearance
 * - Title truncates at 70 characters on word boundary
 *
 * Image Handling:
 * - Uses post.coverImage if provided in the MDX frontmatter
 * - Falls back to the default image defined in data/metadata.ts if no coverImage
 * - Default image path is configured in metadata.defaultImage.url
 *
 * @see {@link "@/data/metadata.ts"} - For default image configuration
 */

import Link from "next/link";
import Image from "next/image";
import { truncateText } from "@/lib/utils";
import { formatDisplay } from "@/lib/dateTime";
// No change needed in imports, just the usage
import { metadata } from "@/data/metadata";
import type { BlogPost } from "@/types/blog";

export function BlogCard({ post }: { post: BlogPost }) {
  // Use post's cover image or fall back to default image from metadata
  const coverImage = post.coverImage || metadata.defaultImage.url;

  return (
    <Link href={`/blog/${post.slug}`} className="block group">
      <article className="flex flex-col rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-50 dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-700 transition-all duration-200 h-full">
        <div className="relative h-48 overflow-hidden flex-shrink-0">
          <Image
            src={coverImage}
            alt={post.title}
            fill
            priority
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        </div>
        <div className="flex flex-col flex-1 p-3 sm:p-4 md:p-6">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-3">
            {post.tags.map(tag => (
              <span
                key={`${post.id}-${tag}`}
                className="px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
              >
                {tag}
              </span>
            ))}
          </div>
          <div className="flex-1 flex flex-col min-h-0">
            <h2 className="text-lg sm:text-xl font-semibold mb-2 text-gray-900 dark:text-white">
              {truncateText(post.title, 70)}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4 line-clamp-2 flex-1">
              {post.excerpt}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-start gap-2 sm:gap-x-4 text-sm text-gray-500 dark:text-gray-400 mt-auto">
            {post.author.avatar ? (
              <div key={`${post.id}-author-with-avatar`} className="flex items-center gap-2">
                <div className="relative w-6 h-6">
                  <Image
                    src={post.author.avatar}
                    alt={post.author.name}
                    fill
                    sizes="24px"
                    className="rounded-full object-cover"
                  />
                </div>
                <span>{post.author.name}</span>
              </div>
            ) : (
              <div key={`${post.id}-author-name`} className="flex items-center gap-2">
                <span>{post.author.name}</span>
              </div>
            )}
            <div key={`${post.id}-date`}>
              {formatDisplay(post.publishedAt)}
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}
