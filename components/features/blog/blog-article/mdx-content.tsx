/**
 * MDXContent Component
 *
 * Server-side renderer for MDX content
 *
 * @param {MDXContentProps} props - Component props
 * @returns {JSX.Element} Rendered MDX content
 */

"use client";

import type { ComponentProps, ReactNode, ReactElement } from 'react';
import { MDXRemote } from 'next-mdx-remote';
import type { MDXRemoteSerializeResult } from 'next-mdx-remote';
import Link from 'next/link';
import { MDXCodeBlock } from '../../../ui/code-block/mdx-code-block.server';
import FinancialMetrics from '../../../ui/financial-metrics.server';
import { BackgroundInfo } from '../../../ui/background-info.client';
import { CollapseDropdown } from '../../../ui/collapse-dropdown.client';
import { ExternalLink } from '../../../ui/external-link.client';
import { ImageWindow } from '../../../ui/window/image-window.client';
import { SoftwareSchema } from './software-schema';
import { cn } from '@/lib/utils';
import { useEffect, useRef } from 'react';
import { processSvgTransforms } from '@/lib/utils/svg-transform-fix';
import { Base64Image } from '@/components/utils/base64-image.client';
import { ResponsiveTable } from '../../../ui/responsive-table.client';
import React, { isValidElement } from 'react';
import { InstructionMacOSFrameTabs, InstructionMACOSTab } from '../../../ui/instruction-macos-frame-tabs.client';
import { ShellParentTabs, ShellTab } from '../../../ui/shell-parent-tabs.client';
import { MacOSWindow, MacOSCodeWindow } from '../../../ui/macos-window.client';
import { TweetEmbed } from '../tweet-embed';

interface ArticleImageProps extends Omit<ComponentProps<'img'>, 'height' | 'width' | 'loading' | 'style'> {
  caption?: string;
  size?: 'full' | 'medium' | 'small';
  priority?: boolean;
}

/**
 * Renders an image within MDX content, with caption and sizing options
 * Handles both external URLs and Base64 data URLs
 * @param {ArticleImageProps} props - Component props for the image
 * @returns {JSX.Element | null} The rendered image component or null if no src
 */
const MdxImage = ({
  src = '',
  alt = '',
  caption,
  size = 'full',
  priority = false
}: ArticleImageProps) => {
  if (!src) return null;

  const isDataUrl = src.startsWith('data:');

  let widthClass = 'max-w-4xl';
  let imageSizes = "(max-width: 1024px) 100vw, 896px";

  if (size === 'medium') {
    widthClass = 'max-w-2xl';
    imageSizes = "(max-width: 768px) 100vw, 672px";
  } else if (size === 'small') {
    widthClass = 'max-w-lg';
    imageSizes = "(max-width: 640px) 100vw, 512px";
  }

  const windowWrapperClass = cn(
    'mx-auto',
    size === 'full' ? 'max-w-4xl' : '',
    size === 'medium' ? 'max-w-2xl' : '',
    size === 'small' ? 'max-w-lg' : ''
  );

  // Choose the appropriate image component based on data URL or external
  const content = isDataUrl ? (
    <Base64Image
      src={src}
      alt={alt}
      width={1600}
      height={800}
      className="rounded-lg shadow-md"
      priority={priority}
    />
  ) : (
    <ImageWindow
      src={src}
      alt={alt}
      width={1600}
      height={800}
      sizes={imageSizes}
      priority={priority || src.endsWith('.svg')}
      unoptimized={src.endsWith('.svg')}
      wrapperClassName={windowWrapperClass}
      noMargin={Boolean(caption)}
      style={{ width: '100%', height: 'auto' }}
    />
  );

  return (
    <>
      <div className={`${widthClass} mx-auto my-6`}>
        {content}
      </div>
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

/**
 * A gallery container for grouping images or other media within an article
 * @param {ArticleGalleryProps} props - Component props for the gallery
 * @returns {JSX.Element} The rendered gallery container
 */
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
 * Client-side renderer for MDX content using MDXRemote
 * Applies custom components and styling for various HTML elements and custom directives
 * Also handles SVG transform processing after content rendering
 *
 * @param {MDXContentProps} props - Component props containing the serialized MDX
 * @returns {JSX.Element} Rendered MDX content as a React element
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
      let isProperCodeBlock = false;
      // Check 1: Class on the <pre> tag itself
      if (props.className && typeof props.className === 'string' && props.className.includes('language-')) {
        isProperCodeBlock = true;
      }

      // Check 2: Class on any direct <code> child, if Check 1 failed
      if (
        !isProperCodeBlock &&
        React.Children.toArray(props.children).some((child) =>
          isValidElement<{ className?: string }>(child) &&
          child.type === 'code' &&
          typeof child.props.className === 'string' &&
          child.props.className.includes('language-')
        )
      ) {
        isProperCodeBlock = true;
      }

      if (!isProperCodeBlock) {
        // For inline code or plain text that somehow got wrapped in a pre tag,
        // or if the structure isn't as expected
        return (
          <div className="group relative">
            <pre className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 p-3 rounded font-mono text-sm break-words whitespace-pre-wrap mb-4">
              {props.children}
            </pre>
          </div>
        );
      }

      // For standalone code blocks, MDXCodeBlock handles its own framing and margins.
      // We ensure it has a bottom margin if it's not part of tabs.
      const isParentTabs = isValidElement(props.children) && (
        (props.children.props as Record<string, unknown>)?.__IS_MACOS_FRAME_TAB ||
        (props.children.props as Record<string, unknown>)?.__IS_SHELL_TAB
      );

      if (isParentTabs) {
        const childElement = props.children as ReactElement;
        const childProps = childElement.props as { className?: string };
        return <MDXCodeBlock {...props} embeddedInTabFrame={true} className={childProps.className} />;
      }

      // For standalone code blocks, MDXCodeBlock handles its own framing. Apply mb-4 to it.
      const childElement = props.children as ReactElement; // Cast to ReactElement
      const childClassName = (childElement.props as { className?: string })?.className; // Safe access
      return (
          <MDXCodeBlock {...props} embeddedInTabFrame={false} className={cn(childClassName, "mb-4")} />
      );
    },
    // Restore custom 'code' component override for inline code (to fix regression)
    code: (codeProps: ComponentProps<'code'>) => {
      const { children, className, ...rest } = codeProps;
      return (
        <code className={cn(
          "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100",
          "px-1 sm:px-1.5 py-0.5 rounded font-medium text-sm break-words whitespace-normal align-middle",
          className // Merge incoming className
        )} {...rest}>
          {children}
        </code>
      );
    },
    MetricsGroup: (props: ComponentProps<typeof FinancialMetrics>) => (
      <div className="mb-4">
        <FinancialMetrics {...props} />
      </div>
    ),
    img: MdxImage, // MdxImage handles its own my-6 or mb-6 for figcaption
    ArticleGallery: (props: ComponentProps<typeof ArticleGallery>) => (
      // ArticleGallery uses my-6 internally, so adding mb-4 here might be redundant or conflict.
      // Let's assume ArticleGallery manages its own spacing correctly as a larger block.
      <ArticleGallery {...props} />
    ),
    ArticleImage: MdxImage, // MdxImage handles its own my-6 or mb-6 for figcaption
    BackgroundInfo: (props: ComponentProps<typeof BackgroundInfo>) => (
      <BackgroundInfo {...props} className={cn(props.className)} />
    ),
    CollapseDropdown: (props: ComponentProps<typeof CollapseDropdown>) => (
      <CollapseDropdown {...props} className={cn(props.className)} />
    ),
    ExternalLink,
    InstructionToggleTabs: (props: ComponentProps<typeof InstructionMacOSFrameTabs>) => (
      <InstructionMacOSFrameTabs {...props} className={cn(props.className)} />
    ),
    InstructionTab: InstructionMACOSTab,
    ShellParentTabs: (props: ComponentProps<typeof ShellParentTabs>) => (
      <ShellParentTabs {...props} className={cn(props.className)} />
    ),
    ShellTab: ShellTab,
    MacOSWindow: (props: ComponentProps<typeof MacOSWindow>) => (
      <MacOSWindow {...props} className={cn(props.className)} />
    ),
    MacOSCodeWindow: (props: ComponentProps<typeof MacOSCodeWindow>) => (
      <MacOSCodeWindow {...props} className={cn(props.className)} />
    ),
    MDXCodeBlock: (props: ComponentProps<typeof MDXCodeBlock>) => ( // This is for direct usage of MDXCodeBlock
      <MDXCodeBlock {...props} className={cn(props.className)} />
    ),
    SoftwareSchema: (props: ComponentProps<typeof SoftwareSchema>) => (
      <div>
        <SoftwareSchema {...props} />
      </div>
    ),
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
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white leading-tight" {...props} />
    ),
    h2: (props: ComponentProps<'h2'>) => (
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white leading-tight" {...props} />
    ),
    h3: (props: ComponentProps<'h3'>) => (
      <h3 className="text-xl font-bold text-gray-900 dark:text-white leading-tight" {...props} />
    ),
    p: (props: ComponentProps<'p'>) => (
      <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-base" {...props} />
    ),
    ul: (props: ComponentProps<'ul'>) => (
      <ul className="pl-6 list-disc text-gray-700 dark:text-gray-300 text-base" {...props} />
    ),
    ol: (props: ComponentProps<'ol'>) => (
      <ol className="pl-6 list-decimal text-gray-700 dark:text-gray-300 text-base" {...props} />
    ),
    li: (props: ComponentProps<'li'>) => (
      // list items typically have smaller bottom margins for tighter packing within the list
      <li className="mb-1 pl-1 text-gray-700 dark:text-gray-300 text-base" {...props} />
    ),
    blockquote: (props: ComponentProps<'blockquote'>) => (
      <blockquote className="pl-4 border-l-4 border-blue-500 dark:border-blue-400 italic text-gray-700 dark:text-gray-300 bg-blue-50 dark:bg-blue-900/20 py-3 px-4 rounded-r-md shadow-sm text-base" {...props} />
    ),
    hr: (props: ComponentProps<'hr'>) => (
      <hr className="hidden" {...props} />
    ),
    // Use the new ResponsiveTable component for markdown tables
    table: (props: ComponentProps<'table'>) => {
      // Destructure children and pass the rest of the props
      const { children, ...restProps } = props;
      return <ResponsiveTable {...restProps}>{children}</ResponsiveTable>;
    },
    // Comment out old table styling overrides if they weren't already
    // th: (props: ComponentProps<'th'>) => (
    //   <th className="..." {...props} />
    // ),
    // td: (props: ComponentProps<'td'>) => (
    //   <td className="..." {...props} />
    // ),
    TweetEmbed: (props: ComponentProps<typeof TweetEmbed>) => (
      <div className="not-prose">
        {/* TweetEmbed handles its own my-6 margin and centering */}
        <TweetEmbed {...props} />
      </div>
    ),
  };

  return (
    // Use base prose for mobile, maintain consistent text size
    <article
      ref={contentRef}
      suppressHydrationWarning={true}
      className={cn(
        "prose dark:prose-invert mx-auto",
        "prose-headings:text-gray-900 dark:prose-headings:text-white",
        "prose-h1:font-bold prose-h1:leading-tight",
        "prose-h2:font-bold prose-h2:leading-tight",
        "prose-h3:font-bold prose-h3:leading-tight",
        "prose-a:text-blue-600 dark:prose-a:text-blue-400 hover:prose-a:text-blue-500 dark:hover:prose-a:text-blue-300",
        "prose-p:break-words prose-p:text-base",
        "prose-img:rounded-lg prose-img:shadow-md",
        "prose-hr:hidden",
        "prose-li:text-base",
        "prose-ul:pl-6",
        "prose-ol:pl-6",
        "prose-blockquote:pl-4 prose-blockquote:border-l-4 prose-blockquote:border-blue-500 dark:prose-blockquote:border-blue-400",
        "blog-content"
      )}
    >
      {/* Enforce consistent vertical gaps */}
      <div className="flex flex-col space-y-6">
        <MDXRemote {...content} components={components} />
      </div>
    </article>
  );
}

// Default export for usage, e.g. with next/dynamic or direct import
export default MDXContent;
