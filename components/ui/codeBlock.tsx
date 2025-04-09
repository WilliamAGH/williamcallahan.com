'use client';

import type { ComponentProps } from 'react';
import { CopyButton } from './copyButton';
import { cn } from '../../lib/utils';

/**
 * Props for the CodeBlock component
 * @interface CodeBlockProps
 * @extends {ComponentProps<'pre'>} - Extends pre element props
 */
export interface CodeBlockProps extends ComponentProps<'pre'> {
  /** The content to be displayed in the code block */
  children: React.ReactNode;
  /** Optional className override */
  className?: string;
}

/**
 * Extract language from className (e.g., "language-typescript" -> "typescript")
 */
const extractLanguage = (className?: string): string => {
  const match = className?.match(/language-(\w+)/);
  return match?.[1] || '';
};

/**
 * Generate line numbers for the code block
 */
const generateLineNumbers = (content: string): string => {
  const lines = content.split('\n').length;
  return Array.from({ length: lines }, (_, i) => i + 1).join('\n');
};

/**
 * Filters out comment lines from text content
 * @param {string} text - The text to filter
 * @returns {string} Text with comments removed
 */
const filterComments = (text: string): string => {
  if (typeof text !== 'string') return '';
  return text
    .split('\n')
    .filter(line => !line.trim().startsWith('#'))
    .join('\n')
    .trim();
};

/**
 * Recursively extracts text content from React nodes
 * @param {React.ReactNode} child - The node to extract text from
 * @returns {string} Extracted text content
 */
const getTextContent = (child: React.ReactNode): string => {
  if (typeof child === 'string') return child;
  if (typeof child === 'number') return String(child);
  if (!child) return '';

  if (typeof child === 'object' && 'props' in child && child.props?.children) {
    if (typeof child.props.children === 'string') return child.props.children;
    if (Array.isArray(child.props.children)) {
      return child.props.children.map(getTextContent).join('');
    }
    return getTextContent(child.props.children);
  }

  return '';
};

/**
 * A component that renders a code block with syntax highlighting and a copy button
 * @component
 * @param {CodeBlockProps} props - The component props
 * @returns {JSX.Element} A code block with copy functionality
 */
export const CodeBlock = ({ children, className, ...props }: CodeBlockProps): JSX.Element => {
  const language = extractLanguage(className);

  // Extract the text content
  const content = Array.isArray(children)
    ? children.map(getTextContent).join('')
    : getTextContent(children);

  // Preserve original content for display but filter comments for copy functionality
  const filteredContent = filterComments(content);

  // Keep original styling as in tests
  const defaultClasses = cn(
    'not-prose',
    'rounded-lg',
    'overflow-x-auto',
    'bg-gray-800',
    'p-4',
    'text-gray-100',
    'text-[13px]'
  );

  return (
    <div className="relative group rounded-lg overflow-hidden bg-gray-800">
      {language && (
        <div className="absolute top-3 right-12 px-2 py-1 text-xs font-mono rounded-md bg-gray-700/50 text-gray-300 uppercase transition-opacity duration-200 opacity-0 group-hover:opacity-100">
          {language}
        </div>
      )}
      <pre
        className={cn(defaultClasses, className)}
        {...props}
      >
        {/* Reduce negative margin slightly to fix overshoot */}
        <code className="-ml-1.5 text-gray-100 bg-transparent text-[13px] [&_*]:!text-gray-100 [&_*]:!bg-transparent">
          {children}
        </code>
      </pre>
      <CopyButton content={filteredContent} />
    </div>
  );
};

// Type assertion to ensure component type is correct
CodeBlock.displayName = 'CodeBlock';
