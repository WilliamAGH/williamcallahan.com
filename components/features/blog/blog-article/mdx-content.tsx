/**
 * MDXContent Component
 *
 * Server-side renderer for MDX content.
 *
 * @param {MDXContentProps} props - Component props
 * @returns {JSX.Element} Rendered MDX content
 */

"use client";
import type { ComponentProps, ReactNode } from 'react';
import { MDXRemote } from 'next-mdx-remote';
import type { MDXRemoteSerializeResult } from 'next-mdx-remote';
import Image from 'next/image';
import { MDXCodeBlock } from '../../../ui/mdxCodeBlock.server';
import FinancialMetrics from '../../../ui/financialMetrics';
import { BackgroundInfo } from '../../../ui/backgroundInfo';

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
 * Server-side renderer for MDX content.
 *
 * @param {MDXContentProps} props - Component props
 * @returns {JSX.Element} Rendered MDX content
 */
export function MDXContent({ content }: MDXContentProps): JSX.Element {
  // Define components map for MDX rendering
  const components = {
    pre: MDXCodeBlock,
    code: (codeProps: ComponentProps<'code'>) => {
      const { children, className, ...rest } = codeProps;
      return (
        <code className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-1.5 py-0.5 rounded" {...rest}>
          {children}
        </code>
      );
    },
    MetricsGroup: FinancialMetrics,
    img: MdxImage,
    ArticleGallery,
    ArticleImage: MdxImage,
    BackgroundInfo
  };

  return (
    <article className="prose dark:prose-invert prose-lg max-w-[85ch] mx-auto prose-headings:text-gray-900 dark:prose-headings:text-white prose-a:text-blue-600 dark:prose-a:text-blue-400 hover:prose-a:text-blue-500 dark:hover:prose-a:text-blue-300 prose-p:my-4 prose-p:whitespace-pre-line">
      <MDXRemote {...content} components={components} />
    </article>
  );
}
