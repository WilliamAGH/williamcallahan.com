'use client';

import { useState } from 'react';
import type { ComponentProps } from 'react';
import { CopyButton } from './copy-button';
import { cn } from '../../../lib/utils';
import { WindowControls } from '../navigation/window-controls';
import { useWindowSize } from '../../../hooks/useWindowSize';

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

  // Add state for interactive behavior
  const [isVisible, setIsVisible] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  // Get window size to determine control size
  const windowSize = useWindowSize();

  // Determine the appropriate control size based on screen width
  const controlSize = windowSize.width && windowSize.width < 640 ? 'sm' :
                     (windowSize.width && windowSize.width > 1280 ? 'lg' : 'md');

  // Handler functions for window controls
  const handleClose = () => {
    setIsVisible(prev => !prev); // Toggle visibility
  };

  const handleMinimize = () => {
    setIsMinimized(prev => !prev);
    if (isMaximized) setIsMaximized(false); // Exit maximized mode if active
  };

  const handleMaximize = () => {
    setIsMaximized(prev => !prev);
    if (isMinimized) setIsMinimized(false); // Exit minimized mode if active
  };

  // Extract the text content
  const content = Array.isArray(children)
    ? children.map(getTextContent).join('')
    : getTextContent(children);

  // Preserve original content for display but filter comments for copy functionality
  const filteredContent = filterComments(content);

  // Return early if code block is closed
  if (!isVisible) {
    return (
      <div className="relative group overflow-hidden my-6 w-full flex justify-center">
        <div className="relative max-w-full w-full shadow-md" style={{
          overflow: 'hidden',
          borderRadius: '8px'
        }}>
          <div className={cn(
            "flex items-center bg-[#1a2a35] border border-gray-700/50 rounded-lg cursor-pointer",
            "px-2 sm:px-3 md:px-4 py-0.5 sm:py-1 md:py-1.5" // Reduced height
          )} onClick={handleClose}>
            <WindowControls
              onClose={handleClose}
              onMinimize={handleMinimize}
              onMaximize={handleMaximize}
              size={controlSize}
            />
            <div className="ml-1.5 sm:ml-2.5 md:ml-3.5 text-[8px] sm:text-[10px] md:text-xs text-gray-400">
              <span>Code block hidden (click to show)</span>
              {language && <span className="ml-1 sm:ml-2 opacity-75">- {language}</span>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "relative my-6 w-full",
      isMaximized && "fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 sm:p-8"
    )}>
      <div className={cn(
        "max-w-full w-full bg-[#f5f2f0] dark:bg-[#282a36] rounded-lg shadow-md overflow-hidden",
        isMaximized && "w-full max-w-[95vw] sm:max-w-5xl max-h-[90vh] sm:max-h-[80vh] flex flex-col"
      )}>
        {/* Header */}
        <div className="flex items-center bg-[#1a2a35] dark:bg-[#1a1b26] px-3 py-1.5 rounded-t-lg">
          <WindowControls
            onClose={handleClose}
            onMinimize={handleMinimize}
            onMaximize={handleMaximize}
            size={controlSize}
          />
          {language && (
            <div className="ml-auto px-1.5 py-0.5 text-[8px] sm:text-xs font-mono rounded-md bg-gray-600/70 text-gray-300 uppercase">
              {language}
            </div>
          )}
        </div>

        {/* Content */}
        {!isMinimized && (
          <div className={cn("relative", isMaximized && "flex-1 overflow-hidden")}>
            <pre
              className={cn(
                'not-prose max-w-full overflow-x-auto p-4',
                'text-gray-900 dark:text-gray-100 text-[13px]',
                'custom-scrollbar',
                '![text-shadow:none] [&_*]:![text-shadow:none]',
                '[&_*]:!bg-transparent',
                isMaximized && 'overflow-auto max-h-full',
                className
              )}
              {...props}
            >
              {children}
            </pre>
            <CopyButton content={filteredContent} />
          </div>
        )}
      </div>

      {/* Exit maximized mode when clicking outside */}
      {isMaximized && (
        <div
          className="absolute inset-0 -z-10"
          onClick={handleMaximize}
          aria-hidden="true"
        />
      )}
    </div>
  );
};

// Type assertion to ensure component type is correct
CodeBlock.displayName = 'CodeBlock';
