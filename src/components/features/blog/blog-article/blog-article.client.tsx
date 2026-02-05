"use client";

/**
 * Blog Article Component
 *
 * Displays a full blog post with responsive layout and proper
 * content formatting across all device sizes.
 *
 * Images in blog articles should maintain a 2:1 aspect ratio (e.g. 800x400)
 * for optimal display and consistency across the site. This applies to both
 * cover images and inline images within the content.
 */

import { ArrowLeft, Calendar, Clock } from "lucide-react";
import Link from "next/link";
import { ErrorBoundary } from "../../../ui/error-boundary.client";
import { BlogAuthor } from "../shared/blog-author";
import { BlogTags } from "../shared/blog-tags";
import { formatDate } from "@/lib/utils";
import { OptimizedCardImage } from "@/components/ui/logo-image.client";

import type { BlogArticleProps } from "@/types/features";

/**
 * BlogArticle Component
 *
 * Renders a full blog post with MDX content, including:
 * - Header with title, date, and reading time
 * - Author information
 * - Tags
 * - Cover image
 * - MDX content with syntax highlighting
 *
 * @param {BlogArticleProps} props - Component props
 * @param {BlogPost} props.post - The blog post data to render
 * @returns {JSX.Element} The rendered blog article
 */
export const BlogArticle: React.FC<BlogArticleProps> = ({ post, mdxContent }) => {
  // Format publication date to a human-readable string (e.g., "June 16, 2025")
  const formattedDate = formatDate(post.publishedAt);

  return (
    <article className="max-w-4xl mx-auto mt-4 sm:mt-8 px-4">
      {/* Back to Blog */}
      <Link
        href="/blog"
        className="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors mb-6 sm:mb-8"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Blog
      </Link>

      {/* Article Header */}
      <header className="mb-6 sm:mb-8">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">{post.title}</h1>

        <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-sm text-gray-600 dark:text-gray-400 mb-4 sm:mb-6">
          <div className="flex items-center">
            <Calendar className="w-4 h-4 mr-2" />
            <span suppressHydrationWarning>{formattedDate}</span>
          </div>
          {post.readingTime ? (
            <div className="flex items-center">
              <Clock className="w-4 h-4 mr-2" />
              {post.readingTime} min read
            </div>
          ) : null}
        </div>

        <BlogAuthor author={post.author} />
        <BlogTags tags={post.tags} interactive />
      </header>

      {/* Cover Image */}
      {post.coverImage && (
        <ErrorBoundary
          fallback={
            <div className="relative aspect-[2/1] mb-6 sm:mb-8 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800" />
          }
        >
          <div className="relative aspect-[2/1] mb-6 sm:mb-8 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
            <OptimizedCardImage
              src={post.coverImage}
              alt={post.title}
              className="object-cover"
              preload
            />
          </div>
        </ErrorBoundary>
      )}

      {/* Article Content */}
      {mdxContent || <div>Loading content...</div>}
    </article>
  );
};
export default BlogArticle;
