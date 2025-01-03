'use client';

import type { ComponentProps } from 'react';
import { CopyButton } from './copy-button';
import { cn } from '../../lib/utils';

/**
 * Props for the CodeBlock component
 * @interface CodeBlockProps
 * @extends {ComponentProps<'pre'>} - Extends pre element props
 */
interface CodeBlockProps extends ComponentProps<'pre'> {
  /** The content to be displayed in the code block */
  children: React.ReactNode;
}

/**
 * A component that renders a code block with syntax highlighting and a copy button
 * @component
 * @param {CodeBlockProps} props - The component props
 * @returns {JSX.Element} A code block with copy functionality
 */
export const CodeBlock: React.FC<CodeBlockProps> = ({ children, className, ...props }) => {
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
    if (typeof child === 'string') return filterComments(child);
    if (typeof child === 'number') return String(child);
    if (!child) return '';

    if (typeof child === 'object' && 'props' in child && child.props?.children) {
      if (typeof child.props.children === 'string') return filterComments(child.props.children);
      if (Array.isArray(child.props.children)) {
        return filterComments(child.props.children.map(getTextContent).join(''));
      }
      return filterComments(getTextContent(child.props.children));
    }

    return '';
  };

  // Extract and filter the text content
  const content = filterComments(
    Array.isArray(children)
      ? children.map(getTextContent).join('')
      : getTextContent(children)
  );

  const defaultClasses = 'not-prose rounded-lg overflow-x-auto bg-gray-800 p-4 text-gray-100';

  return (
    <div className="relative">
      <pre
        className={cn(defaultClasses, className)}
        {...props}
      >
        {children}
      </pre>
      <CopyButton content={content} />
    </div>
  );
};

// Type assertion to ensure component type is correct
CodeBlock.displayName = 'CodeBlock';
