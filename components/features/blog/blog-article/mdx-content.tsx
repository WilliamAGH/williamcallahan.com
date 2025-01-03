'use client';

import type { ComponentProps } from 'react';
import { MDXRemote } from 'next-mdx-remote';
import type { MDXRemoteSerializeResult } from 'next-mdx-remote';
import Image from 'next/image';
import { CodeBlock } from '../../../ui/code-block';
import FinancialMetrics from '../../../ui/financial-metrics';

const MdxImage = ({ src = '', alt = '', ...props }: ComponentProps<'img'>) => {
  // Check if this is a cover image (first image in the article)
  const isCoverImage = src.includes('winning mechanical keyboard');

  if (isCoverImage) {
    return (
      <div className="my-8">
        <Image
          src={src}
          alt={alt}
          priority
          width={900}
          height={600}
          className="rounded-lg mx-auto"
        />
      </div>
    );
  }

  // Article images (the ones in the flex layout)
  return (
    <div className="w-full h-full my-8">
      <figure className="relative">
        <div className="relative group overflow-hidden rounded-xl bg-gradient-to-br from-gray-100/30 via-gray-200/20 to-gray-300/30 dark:from-gray-800/30 dark:via-gray-900/20 dark:to-gray-800/30 shadow-xl transition-all duration-300 hover:shadow-2xl ring-1 ring-gray-900/5 dark:ring-white/10">
          <div className="aspect-[3/2] relative">
            <Image
              src={src}
              alt={alt}
              priority
              fill
              sizes="(min-width: 768px) 65vw, 100vw"
              className="object-cover rounded-xl transform transition-all duration-300 group-hover:scale-[1.02] group-hover:brightness-105"
            />
          </div>
        </div>
        {alt && (
          <figcaption className="mt-3 text-sm text-center italic text-gray-600 dark:text-gray-400">
            {alt}
          </figcaption>
        )}
      </figure>
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
    <div className="prose dark:prose-invert prose-lg max-w-[85ch] mx-auto prose-headings:text-gray-900 dark:prose-headings:text-white prose-a:text-blue-600 dark:prose-a:text-blue-400 hover:prose-a:text-blue-500 dark:hover:prose-a:text-blue-300 [&_p]:whitespace-pre-line prose-p:my-4">
      <MDXRemote
        {...content}
        components={{
          pre: ({ children, ...props }: ComponentProps<'pre'>) => (
            <CodeBlock {...props}>
              {children}
            </CodeBlock>
          ),
          code: ({ children, ...props }: ComponentProps<'code'>) => (
            <code className="text-gray-100" {...props}>
              {children}
            </code>
          ),
          MetricsGroup: (props: any) => (
            <FinancialMetrics {...props} />
          ),
          img: MdxImage
        }}
      />
    </div>
  );
};
