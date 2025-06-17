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

"use client";

import { ArrowLeft, Calendar, Clock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorBoundary } from "../../../ui/error-boundary.client";
import { BlogAuthor } from "../shared/blog-author";
import { BlogTags } from "../shared/blog-tags";
import { MDXContent } from "./mdx-content";
import { formatDate } from "@/lib/utils";

import type { Article, WithContext } from "schema-dts";
import type { BlogPost } from "../../../../types/blog";

interface BlogArticleProps {
  /** The blog post data to render */
  post: BlogPost;
  /** JSON-LD structured data for the blog post */
  jsonLd?: WithContext<Article>;
}

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
export const BlogArticle: React.FC<BlogArticleProps> = ({ post }) => {
  // Format publication date to a human-readable string (e.g., "June 16, 2025")
  const formattedDate = formatDate(post.publishedAt);
  // State to track mounted status and cleanup queue
  const [isMounted, setIsMounted] = useState(false);
  const cleanupQueue = useRef<(() => void)[]>([]);

  // Add cleanup function to queue
  const addCleanup = useCallback((cleanup: () => void) => {
    cleanupQueue.current.push(cleanup);
  }, []);

  // Setup and cleanup effects
  useEffect(() => {
    setIsMounted(true);

    return () => {
      setIsMounted(false);

      // Execute all cleanup functions
      for (const cleanup of cleanupQueue.current) {
        try {
          cleanup();
        } catch (error) {
          console.error("Cleanup error:", error);
        }
      }
      cleanupQueue.current = [];

      // Additional cleanup
      if (typeof window !== "undefined" && window.document) {
        for (const selector of [
          "[data-fullscreen-image]",
          "[data-modal-backdrop]",
          "[data-article-image]",
        ]) {
          const elements = window.document.querySelectorAll(selector);
          for (const el of elements) {
            if (el instanceof HTMLElement) {
              // Fade out before removal
              el.style.opacity = "0";
              el.style.transition = "opacity 0.2s ease-out";

              setTimeout(() => {
                el.remove();
              }, 200);
            } else {
              el.remove();
            }
          }
        }
      }
    };
  }, []);

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
            {formattedDate}
          </div>
          {post.readingTime ? (
            <div className="flex items-center">
              <Clock className="w-4 h-4 mr-2" />
              {post.readingTime} min read
            </div>
          ) : null}
        </div>

        <BlogAuthor author={post.author} />
        <BlogTags tags={post.tags} />
      </header>

      {/* Cover Image */}
      {post.coverImage && isMounted && (
        <ErrorBoundary
          fallback={
            <div className="relative aspect-[2/1] mb-6 sm:mb-8 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800" />
          }
        >
          <div className="relative aspect-[2/1] mb-6 sm:mb-8 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
            <Image
              src={post.coverImage}
              alt={post.title}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover"
              priority
              data-article-image="cover"
              unoptimized={false}
              onLoad={() => {
                addCleanup(() => {
                  if (typeof window !== "undefined" && window.document) {
                    const img = window.document.querySelector(`img[src="${post.coverImage}"]`);
                    if (img instanceof HTMLElement) {
                      img.style.opacity = "0";
                    }
                  }
                });
              }}
            />
          </div>
        </ErrorBoundary>
      )}

      {/* Article Content */}
      <MDXContent content={post.content} />
    </article>
  );
};
export default BlogArticle;
