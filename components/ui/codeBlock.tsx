'use client';

import type { ComponentProps } from 'react';
import { CopyButton } from './copyButton';
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
  /**
   * Recursively extracts text content from React nodes
   * @param {React.ReactNode} node - The node to extract text from
   * @returns {string} Extracted text content
   */
  const extractText = (node: React.ReactNode): string => {
    if (typeof node === 'string') return node;
    if (typeof node === 'number') return String(node);
    if (!node) return '';

    if (Array.isArray(node)) {
      return node.map(extractText).join('');
    }

    if (typeof node === 'object' && 'props' in node) {
      if (typeof node.props.children === 'string') {
        return node.props.children;
      }
      if (Array.isArray(node.props.children)) {
        return node.props.children.map(extractText).join('');
      }
      if (node.props.children) {
        return extractText(node.props.children);
      }
    }

    return '';
  };

  /**
   * Filters out comment lines from text content
   * @param {string} text - The text to filter
   * @returns {string} Text with comments removed
   */
  const filterComments = (text: string): string => {
    return text
      .split('\n')
      .filter(line => !line.trim().startsWith('#'))
      .map(line => line.trim())
      .join('\n')
      .trim();
  };

  // Extract text content and filter comments
  const rawText = extractText(children);
  const content = filterComments(rawText);

  const defaultClasses = 'not-prose rounded-lg overflow-x-auto bg-gray-800 p-4 text-gray-100 text-sm max-h-[400px] overflow-y-auto';

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
