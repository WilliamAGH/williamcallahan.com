// components/features/blog/blog-article/blog-article.tsx

'use client';

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

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, useRef, useCallback } from 'react';
import { ArrowLeft, Clock, Calendar } from 'lucide-react';
import { ErrorBoundary } from '../../../ui/errorBoundary';
import { BlogAuthor } from '../shared/blog-author';
import { BlogTags } from './blog-tags';
import { MDXContent } from './mdx-content';
import { formatDisplay } from '../../../../lib/dateTime';
import type { BlogPost } from '../../../../types/blog';
import type { Article, WithContext } from 'schema-dts';

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
      cleanupQueue.current.forEach(cleanup => {
        try {
          cleanup();
        } catch (error) {
          console.error('Cleanup error:', error);
        }
      });
      cleanupQueue.current = [];

      // Additional cleanup
      ['[data-fullscreen-image]', '[data-modal-backdrop]', '[data-article-image]'].forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          if (el instanceof HTMLElement) {
            // Fade out before removal
            el.style.opacity = '0';
            el.style.transition = 'opacity 0.2s ease-out';

            setTimeout(() => {
              el.remove();
            }, 200);
          } else {
            el.remove();
          }
        });
      });
    };
  }, []);

  // Error boundary for image rendering
  const handleImageError = useCallback((error: Error) => {
    console.error('Image rendering error:', error);
    // Could add error reporting here
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
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
          {post.title}
        </h1>

        <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-sm text-gray-600 dark:text-gray-400 mb-4 sm:mb-6">
          <div className="flex items-center">
            <Calendar className="w-4 h-4 mr-2" />
            {formatDisplay(post.publishedAt)}
          </div>
          <div className="flex items-center">
            <Clock className="w-4 h-4 mr-2" />
            {post.readingTime} min read
          </div>
        </div>

        <BlogAuthor author={post.author} />
        <BlogTags tags={post.tags} />
      </header>

      {/* Cover Image */}
      {post.coverImage && isMounted && (
        <ErrorBoundary onError={handleImageError} fallback={
          <div className="relative aspect-[2/1] mb-6 sm:mb-8 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800" />
        }>
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
              loading="eager"
              onLoad={() => {
                addCleanup(() => {
                  const img = document.querySelector(`img[src="${post.coverImage}"]`);
                  if (img instanceof HTMLElement) {
                    img.style.opacity = '0';
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
}
export default BlogArticle;
