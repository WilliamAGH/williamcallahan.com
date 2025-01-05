'use client';

import type { ComponentProps, ReactNode } from 'react';
import { MDXRemote } from 'next-mdx-remote';
import type { MDXRemoteSerializeResult } from 'next-mdx-remote';
import Image from 'next/image';
import { CodeBlock } from '../../../ui/code-block';
import FinancialMetrics from '../../../ui/financial-metrics';
import type { ImageCaption } from '../../../../types/blog';

interface ArticleImageProps extends Omit<ComponentProps<'img'>, 'height' | 'width' | 'loading' | 'style'> {
  caption?: string;
}

const MdxImage = ({
  src = '',
  alt = '',
  caption,
  ...props
}: ArticleImageProps) => {
  if (!src) return null;

  const isCoverImage = src === props.title;

  if (isCoverImage) {
    return (
      <div className="mt-4 mb-8">
        <Image
          src={src}
          alt={alt}
          priority
          width={1600}
          height={800}
          className="rounded-lg mx-auto"
        />
      </div>
    );
  }

  return (
    <figure className="mt-4 mb-12 max-w-3xl mx-auto grid grid-cols-1 gap-6">
      <div className="w-full h-0 pt-[66.67%] relative">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 768px) 100vw, 768px"
          className="absolute top-0 left-0 w-full h-full rounded-lg object-cover shadow-lg"
        />
      </div>
      {caption && (
        <figcaption className="text-base text-gray-600 dark:text-gray-400 italic text-center px-4">
          {caption}
        </figcaption>
      )}
    </figure>
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
          img: MdxImage,
          ArticleGallery,
          ArticleImage: MdxImage
        }}
      />
    </article>
  );
};
