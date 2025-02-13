'use client';

import { useState, useEffect, useRef, useCallback, type ComponentProps, type ReactNode } from 'react';
import { MDXRemote } from 'next-mdx-remote';
import type { MDXRemoteSerializeResult } from 'next-mdx-remote';
import Image from 'next/image';
import { CodeBlock } from '../../../ui/codeBlock';
import { ErrorBoundary } from '../../../ui/errorBoundary';
import FinancialMetrics from '../../../ui/financialMetrics';
import type { ImageCaption } from '../../../../types/blog';

interface ArticleImageProps extends Omit<ComponentProps<'img'>, 'height' | 'width' | 'loading' | 'style'> {
  caption?: string;
}

interface MdxImageProps extends ArticleImageProps {
  addCleanup?: (cleanup: () => void) => void;
}

type CleanupFunction = () => void;

const MdxImage = ({
  src = '',
  alt = '',
  caption,
  addCleanup,
  ...props
}: MdxImageProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // Reset loaded state when src changes
    setIsLoaded(false);

    // Register cleanup function if provided
    if (addCleanup && src) {
      addCleanup(() => {
        if (imageRef.current) {
          imageRef.current.style.opacity = '0';
          imageRef.current.style.transition = 'opacity 0.2s ease-out';
        }
      });
    }
  }, [src, addCleanup]);

  if (!src) return null;

  const isCoverImage = src === props.title;

  const handleLoad = () => {
    setIsLoaded(true);
  };

  if (isCoverImage) {
    return (
      <ErrorBoundary fallback={<div className="mt-4 mb-8 bg-gray-100 dark:bg-gray-800 rounded-lg" style={{ aspectRatio: '2/1' }} />}>
        <div className="mt-4 mb-8">
          <Image
            ref={imageRef}
            src={src}
            alt={alt}
            priority
            width={1600}
            height={800}
            className={`rounded-lg mx-auto transition-opacity duration-200 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={handleLoad}
            data-article-image="inline"
            unoptimized={false}
            loading="eager"
          />
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary fallback={<div className="mt-4 mb-12 bg-gray-100 dark:bg-gray-800 rounded-lg" style={{ aspectRatio: '3/2' }} />}>
      <figure className="mt-4 mb-12 max-w-3xl mx-auto grid grid-cols-1 gap-6">
        <div className="w-full h-0 pt-[66.67%] relative">
          <Image
            ref={imageRef}
            src={src}
            alt={alt}
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className={`absolute top-0 left-0 w-full h-full rounded-lg object-cover shadow-lg transition-opacity duration-200 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={handleLoad}
            data-article-image="inline"
            unoptimized={false}
            loading="eager"
          />
        </div>
        {caption && (
          <figcaption className="text-base text-gray-600 dark:text-gray-400 italic text-center px-4">
            {caption}
          </figcaption>
        )}
      </figure>
    </ErrorBoundary>
  );
};

interface ArticleGalleryProps {
  children: ReactNode;
  className?: string;
}

const ArticleGallery = ({
  children,
  className = ''
}: ArticleGalleryProps) => {
  return (
    <div className={`flow-root space-y-12 my-8 ${className}`}>
      {children}
    </div>
  );
};

/**
 * Props for the MDXContent component
 */
interface MDXContentProps {
  /** Serialized MDX content to render */
  content: MDXRemoteSerializeResult;
}

/**
 * MDXContent Component
 *
 * Client-side renderer for MDX content with syntax highlighting.
 * Separated from the main BlogArticle component to maintain proper
 * client/server component boundaries.
 *
 * @param {MDXContentProps} props - Component props
 * @returns {JSX.Element} Rendered MDX content
 */
export const MDXContent: React.FC<MDXContentProps> = ({ content }) => {
  const cleanupQueue = useRef<CleanupFunction[]>([]);

  const addCleanup = useCallback((cleanup: CleanupFunction) => {
    cleanupQueue.current.push(cleanup);
  }, []);

  useEffect(() => {
    return () => {
      // Execute all cleanup functions
      cleanupQueue.current.forEach(cleanup => {
        try {
          cleanup();
        } catch (error) {
          console.error('MDX cleanup error:', error);
        }
      });
      cleanupQueue.current = [];
    };
  }, []);
  // Cleanup effect to handle unmounting
  useEffect(() => {
    return () => {
      // Remove any lingering image states or elements
      document.querySelectorAll('[data-article-image]').forEach(el => {
        if (el instanceof HTMLElement) {
          el.style.opacity = '0';
        }
      });
    };
  }, []);

  return (
    <article className="prose dark:prose-invert prose-lg max-w-[85ch] mx-auto prose-headings:text-gray-900 dark:prose-headings:text-white prose-a:text-blue-600 dark:prose-a:text-blue-400 hover:prose-a:text-blue-500 dark:hover:prose-a:text-blue-300 prose-p:my-4 prose-p:whitespace-pre-line">
      <MDXRemote
        {...content}
        components={{
          pre: ({ children, ...props }: ComponentProps<'pre'>) => (
            <CodeBlock {...props}>
              {children}
            </CodeBlock>
          ),
          code: ({ children, ...props }: ComponentProps<'code'>) => (
            <code className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-1.5 py-0.5 rounded" {...props}>
              {children}
            </code>
          ),
          MetricsGroup: (props: ComponentProps<typeof FinancialMetrics>) => (
            <FinancialMetrics {...props} />
          ),
          img: (props: ArticleImageProps) => <MdxImage {...props} addCleanup={addCleanup} />,
          ArticleGallery,
          ArticleImage: (props: ArticleImageProps) => <MdxImage {...props} addCleanup={addCleanup} />
        }}
      />
    </article>
  );
};
