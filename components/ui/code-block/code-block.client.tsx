/**
 * CodeBlock Component
 *
 * A component that renders a code block with syntax highlighting and a copy button.
 *
 * @module components/ui/code-block/code-block.client
 */

'use client';

import { useState, useEffect, useRef, useCallback, isValidElement, ReactNode } from 'react'; // Import useEffect, useRef, useCallback, isValidElement, ReactNode
import type { ComponentProps } from 'react';
import { CopyButton } from './copy-button.client';
import { cn } from '../../../lib/utils';
import { WindowControls } from '../navigation/window-controls';
import { useWindowSize } from '../../../lib/hooks/use-window-size.client';

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
 * @param {React.ReactNode} node - The node to extract text from
 * @returns {string} Extracted text content
 */
const getTextContent = (node: ReactNode): string => {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (!node) return ''; // Handles null, undefined, false

  // If 'node' is an array of ReactNodes
  if (Array.isArray(node)) {
    return node.map(getTextContent).join('');
  }

  // Check if it's a valid React element that might have children
  if (isValidElement(node)) {
    // node.props.children is ReactNode. We need to recurse on it.
    const props = node.props as { children?: ReactNode; [key: string]: unknown }; // Type assertion for props
    return getTextContent(props.children); // Recurse
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

  // Ref for the main window element to check clicks against
  const windowRef = useRef<HTMLDivElement>(null);

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

  // Wrap in useCallback to prevent recreation on each render
  const handleMaximize = useCallback(() => {
    setIsMaximized(prev => !prev);
    if (isMinimized) setIsMinimized(false); // Exit minimized mode if active
  }, [isMinimized]); // Add dependencies

  // Effect for handling Escape key and click outside when maximized
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isMaximized) {
        handleMaximize(); // Close maximized view on Escape
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      // Check if maximized and the click is outside the windowRef element
      if (isMaximized && windowRef.current && !windowRef.current.contains(event.target as Node)) {
        handleMaximize(); // Close maximized view
      }
    };

    if (isMaximized) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside); // Use mousedown like Terminal
    }

    // Cleanup function
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMaximized, handleMaximize]); // Dependencies

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
      // When maximized, this outer div becomes the fixed positioning wrapper
      isMaximized && "fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 sm:p-8"
    )}>
      {/* This inner div is the actual window content, assign the ref here */}
      <div ref={windowRef} className={cn(
        "max-w-full w-full bg-[#f5f2f0] dark:bg-[#282a36] rounded-lg shadow-md overflow-hidden",
        // Styles for the inner div when maximized
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
            <div className="ml-auto flex-shrink min-w-0 px-1.5 py-0.5 text-[8px] sm:text-xs font-mono rounded-md bg-gray-600/70 text-gray-300 uppercase truncate"> {/* Allow shrinking and truncate */}
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

      {/* Backdrop - Renders only when maximized, but click logic is now handled by the useEffect */}
      {/* We keep a basic backdrop for visual effect if desired, or remove if the effect handles it */}
      {/*
      {isMaximized && (
        <div
          className="absolute inset-0 -z-10 bg-transparent" // Make it transparent, click handled by effect
          aria-hidden="true"
        />
      )}
      */}
      {/* The useEffect now handles the click outside logic */}
    </div>
  );
};

// Type assertion to ensure component type is correct
CodeBlock.displayName = 'CodeBlock';
