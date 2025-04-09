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
import Link from 'next/link'; // Import Next.js Link
import { MDXCodeBlock } from '../../../ui/mdxCodeBlock.server';
import FinancialMetrics from '../../../ui/financialMetrics';
import { BackgroundInfo } from '../../../ui/backgroundInfo';
import { CollapseDropdown } from '../../../ui/collapseDropdown';
import { ExternalLink } from '../../../ui/externalLink';

interface ArticleImageProps extends Omit<ComponentProps<'img'>, 'height' | 'width' | 'loading' | 'style'> {
  caption?: string;
  size?: 'full' | 'medium' | 'small';
}

const MdxImage = ({
  src = '',
  alt = '',
  caption,
  size = 'full',
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

  let widthClass = 'max-w-4xl';
  let imageSizes = "(max-width: 1024px) 100vw, 896px";

  if (size === 'medium') {
    widthClass = 'max-w-2xl';
    imageSizes = "(max-width: 768px) 100vw, 672px";
  } else if (size === 'small') {
    widthClass = 'max-w-lg';
    imageSizes = "(max-width: 640px) 100vw, 512px";
  }

  return (
    <figure className={`my-8 ${widthClass} mx-auto`}>
      <div className="w-full h-auto relative">
        <Image
          src={src}
          alt={alt}
          width={1600}
          height={800}
          sizes={imageSizes}
          className="w-full h-auto rounded-lg object-contain shadow-lg"
        />
      </div>
      {caption && (
        <figcaption className="text-base text-gray-600 dark:text-gray-400 italic text-center">
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
    BackgroundInfo,
    CollapseDropdown, // Register the new component
    // Custom anchor tag renderer
    a: (props: ComponentProps<'a'>) => {
      const { href, children, ...rest } = props;
      if (!href) {
        // Handle case where href might be missing, though unlikely in valid MDX
        return <a {...rest}>{children}</a>;
      }
      // Check if it's an external link
      if (href.startsWith('http://') || href.startsWith('https://')) {
        return <ExternalLink href={href} {...rest}>{children}</ExternalLink>;
      }
      // Check if it's an internal link (starts with /)
      if (href.startsWith('/')) {
        return <Link href={href} {...rest}>{children}</Link>;
      }
      // Otherwise, assume it's an anchor link or similar, render standard anchor
      return <a href={href} {...rest}>{children}</a>;
    },
  };

  return (
    // Use base prose for mobile, scale up to prose-lg on medium screens+
    <article className="prose dark:prose-invert md:prose-lg mx-auto px-4 prose-headings:text-gray-900 dark:prose-headings:text-white prose-a:text-blue-600 dark:prose-a:text-blue-400 hover:prose-a:text-blue-500 dark:hover:prose-a:text-blue-300 prose-p:my-4 prose-p:break-words blog-content">
      <MDXRemote {...content} components={components} />
    </article>
  );
}
