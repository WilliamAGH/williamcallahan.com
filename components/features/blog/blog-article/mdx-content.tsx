'use client';

import type { ComponentProps } from 'react';
import { MDXRemote } from 'next-mdx-remote';
import type { MDXRemoteSerializeResult } from 'next-mdx-remote';
import { CodeBlock } from '../../../ui/code-block';

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
    <div className="prose dark:prose-invert prose-lg max-w-none prose-img:rounded-lg prose-img:mx-auto prose-headings:text-gray-900 dark:prose-headings:text-white prose-a:text-blue-600 dark:prose-a:text-blue-400 hover:prose-a:text-blue-500 dark:hover:prose-a:text-blue-300">
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
          )
        }}
      />
    </div>
  );
};
