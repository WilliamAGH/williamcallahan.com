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
import { MDXCodeBlock } from '../../../ui/code-block/mdx-code-block.server';
import FinancialMetrics from '../../../ui/financial-metrics.server';
import { BackgroundInfo } from '../../../ui/background-info.client';
import { CollapseDropdown } from '../../../ui/collapse-dropdown.client';
import { ExternalLink } from '../../../ui/external-link.client';
import { ImageWindow } from '../../../ui/window/image-window.client'; // Import the new component
import { SoftwareSchema } from './software-schema'; // Import SoftwareSchema
import { cn } from '@/lib/utils'; // Import cn utility
import { useEffect, useRef } from 'react';
import { processSvgTransforms } from '@/lib/utils/svg-transform-fix';
import { Base64Image } from '@/components/utils/base64-image.client';

interface ArticleImageProps extends Omit<ComponentProps<'img'>, 'height' | 'width' | 'loading' | 'style'> {
  caption?: string;
  size?: 'full' | 'medium' | 'small';
  priority?: boolean; // Add priority prop here
}

const MdxImage = ({
  src = '',
  alt = '',
  caption,
  size = 'full',
  priority, // Destructure priority here
  ...props
}: ArticleImageProps) => {
  if (!src) return null;

  const isCoverImage = src === props.title;
  const isDataUrl = src.startsWith('data:');

  if (isCoverImage) {
    return (
      <div className="mt-4 mb-6">
        <Image
          src={src}
          alt={alt}
          priority
          width={1600}
          height={800}
          className="rounded-lg mx-auto shadow-md"
          unoptimized={src.endsWith('.svg') || isDataUrl}
          sizes="(max-width: 768px) 100vw, 1600px"
          style={{ width: '100%', height: 'auto' }} // Maintain aspect ratio
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

  // Determine wrapper class based on size prop for ImageWindow
  const windowWrapperClass = cn(
    'mx-auto', // Remove my-6, keep centering
    size === 'full' ? 'max-w-4xl' : '',
    size === 'medium' ? 'max-w-2xl' : '',
    size === 'small' ? 'max-w-lg' : ''
  );

  // Special handling for data: URLs
  if (isDataUrl) {
    return (
      <>
        <div className={`${widthClass} mx-auto my-6`}>
          <Base64Image
            src={src}
            alt={alt}
            width={1600}
            height={800}
            className="rounded-lg shadow-md"
            priority={priority}
          />
        </div>
        {caption && (
          <figcaption className={`text-base text-gray-600 dark:text-gray-400 italic text-center mt-2 mb-6 px-4 ${widthClass} mx-auto`}>
            {caption}
          </figcaption>
        )}
      </>
    );
  }

  return (
    <>
      <ImageWindow
        src={src}
        alt={alt}
        width={1600} // Pass original intended dimensions
        height={800}
        sizes={imageSizes}
        priority={priority || src.endsWith('.svg')} // Always prioritize SVGs
        unoptimized={src.endsWith('.svg')} // Only skip optimization for SVGs now
        wrapperClassName={windowWrapperClass}
        noMargin={Boolean(caption)} // Use noMargin when we have a caption to avoid margin conflicts
        style={{ width: '100%', height: 'auto' }} // Ensure auto height to maintain aspect ratio
        // Pass any other relevant ImageProps via ...props if needed
      />
      {caption && (
        <figcaption className={`text-base text-gray-600 dark:text-gray-400 italic text-center mt-2 mb-6 px-4 ${widthClass} mx-auto`}>
          {caption}
        </figcaption>
      )}
    </>
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
    <div className={`flow-root space-y-8 my-6 p-4 bg-gray-50 dark:bg-gray-800/30 rounded-lg ${className}`}>
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
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fix all SVG transforms in the rendered MDX content
    if (contentRef.current) {
      const svgs = contentRef.current.querySelectorAll('svg');
      svgs.forEach(svg => {
        processSvgTransforms(svg);
      });
    }
  }, [content]);

  // Define components map for MDX rendering
  const components = {
    // Use MDXCodeBlock with a custom class that will override prose styling
    pre: (props: ComponentProps<'pre'>) => {
      // Check if this is just inline code that got wrapped in a pre tag
      const children = props.children as React.ReactElement;
      const childClassName = children?.props?.className || '';
      // If there's no language class (like language-bash), treat it as inline code
      const isProperCodeBlock = childClassName.includes('language-');

      if (!isProperCodeBlock) {
        // For inline code or plain text that somehow got wrapped in a pre tag
        return (
          <div className="group relative">
            <pre className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 p-3 rounded font-mono text-sm break-words whitespace-pre-wrap my-4">
              {props.children}
            </pre>
          </div>
        );
      }

      // Regular code blocks with language specification
      return (
        <div className="not-prose">
          <MDXCodeBlock {...props} />
        </div>
      );
    },
    // Restore custom 'code' component override for inline code (to fix regression)
    code: (codeProps: ComponentProps<'code'>) => {
      const { children, className, ...rest } = codeProps;
      return (
        <code className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-1 sm:px-1.5 py-0.5 rounded font-medium text-sm break-words whitespace-normal align-middle" {...rest}>
          {children}
        </code>
      );
    },
    MetricsGroup: FinancialMetrics,
    img: MdxImage,
    ArticleGallery,
    ArticleImage: MdxImage,
    BackgroundInfo,
    CollapseDropdown,
    SoftwareSchema, // Add SoftwareSchema to components
    // Custom anchor tag renderer
    a: (props: ComponentProps<'a'>) => {
      const { href, children, ...rest } = props;
      if (!href) {
        // Handle case where href might be missing, though unlikely in valid MDX
        return <a {...rest}>{children}</a>;
      }

      // Check if it's a footnote reference link (e.g., href="#fn1") or back-link (e.g., href="#fnref1")
      if (href.startsWith('#fn')) {
        // Render footnote links as plain text (just the number/arrow)
        // We might need to adjust styling further if needed, but remove link behavior
        return <span {...rest}>{children}</span>;
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
      // Retain default anchor styling for intra-page links like headings
      return <a href={href} className="text-inherit no-underline hover:underline" {...rest}>{children}</a>;
    },
    // Enhance headings with better styling
    h1: (props: ComponentProps<'h1'>) => (
      <h1 className="text-3xl font-bold mt-8 md:mt-12 mb-4 md:mb-6 pt-4 md:pt-6 text-gray-900 dark:text-white leading-tight" {...props} />
    ),
    h2: (props: ComponentProps<'h2'>) => (
      <h2 className="text-2xl font-bold mt-12 md:mt-16 mb-5 md:mb-6 pt-3 md:pt-6 text-gray-900 dark:text-white leading-tight" {...props} />
    ),
    h3: (props: ComponentProps<'h3'>) => (
      <h3 className="text-xl font-bold mt-8 md:mt-10 mb-3 md:mb-4 pt-2 md:pt-3 text-gray-900 dark:text-white leading-tight" {...props} />
    ),
    p: (props: ComponentProps<'p'>) => (
      <p className="my-3 text-gray-700 dark:text-gray-300 leading-relaxed" {...props} />
    ),
    ul: (props: ComponentProps<'ul'>) => (
      <ul className="my-3 pl-6 list-disc text-gray-700 dark:text-gray-300" {...props} />
    ),
    ol: (props: ComponentProps<'ol'>) => (
      <ol className="my-3 pl-6 list-decimal text-gray-700 dark:text-gray-300" {...props} />
    ),
    li: (props: ComponentProps<'li'>) => (
      <li className="my-1 pl-1 text-gray-700 dark:text-gray-300" {...props} />
    ),
    blockquote: (props: ComponentProps<'blockquote'>) => (
      <blockquote className="my-3 pl-4 border-l-4 border-blue-500 dark:border-blue-400 italic text-gray-700 dark:text-gray-300 bg-blue-50 dark:bg-blue-900/20 py-3 px-4 rounded-r-md shadow-sm" {...props} />
    ),
    hr: (props: ComponentProps<'hr'>) => (
      <hr className="hidden" {...props} />
    ),
    // Remove custom table styling to let Prose handle it
    // table: (props: ComponentProps<'table'>) => (
    //   <div className="my-4 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800 shadow-sm">
    //     <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800" {...props} />
    //   </div>
    // ),
    // th: (props: ComponentProps<'th'>) => (
    //   <th className="px-4 py-3 bg-gray-50 dark:bg-gray-800 text-left text-sm font-medium text-gray-700 dark:text-gray-300" {...props} />
    // ),
    // td: (props: ComponentProps<'td'>) => (
    //   <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 border-t border-gray-100 dark:border-gray-800" {...props} />
    // ),
  };

  return (
    // Use base prose for mobile, scale up to prose-lg on medium screens+
    <article
      ref={contentRef}
      className="prose dark:prose-invert md:prose-lg mx-auto prose-headings:text-gray-900 dark:prose-headings:text-white prose-a:text-blue-600 dark:prose-a:text-blue-400 hover:prose-a:text-blue-500 dark:hover:prose-a:text-blue-300 prose-p:my-3 prose-p:break-words prose-img:rounded-lg prose-img:shadow-md prose-hr:hidden blog-content"
    >
      <MDXRemote {...content} components={components} />
    </article>
  );
}

// Create a named variable for the default export
const MDXContentExport = { MDXContent };

// Default export for next/dynamic
export default MDXContentExport;
