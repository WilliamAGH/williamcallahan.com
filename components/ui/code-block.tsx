'use client';

import type { ComponentProps } from 'react';
import { CopyButton } from './copy-button';

interface CodeBlockProps extends ComponentProps<'pre'> {
  children: React.ReactNode;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ children, ...props }) => {
  // Extract the text content from the children
  const filterComments = (text: string): string => {
    // Split by newlines, filter out comment lines, and rejoin
    return text
      .split('\n')
      .filter(line => !line.trim().startsWith('#'))
      .join('\n')
      .trim();
  };

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

  const content = filterComments(
    Array.isArray(children)
      ? children.map(getTextContent).join('')
      : getTextContent(children)
  );

  return (
    <div className="relative">
      <pre className="not-prose rounded-lg overflow-x-auto bg-gray-800 p-4 text-gray-100" {...props}>
        {children}
      </pre>
      <CopyButton content={content} />
    </div>
  );
};
