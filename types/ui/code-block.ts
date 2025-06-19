/**
 * Code Block Component Types
 *
 * SCOPE: Types for the code block component, including syntax highlighting and copy functionality.
 */
import type { ReactNode } from "react";

export type CodeBlockLanguage = string;

/**
 * Props for CodeBlock component that extends pre element properties
 * Supports syntax highlighting and embedded display options
 */
export interface CodeBlockProps extends React.ComponentProps<"pre"> {
  /** The content to be displayed in the code block */
  children: React.ReactNode;
  /** Optional className override */
  className?: string;
  /** If true, indicates the CodeBlock is embedded within another tabbed MacOSFrame, influencing its chrome */
  embeddedInTabFrame?: boolean;
  /** Programming language for syntax highlighting */
  language?: CodeBlockLanguage;
  /** Optional filename to display */
  filename?: string;
  /** Whether to show line numbers */
  showLineNumbers?: boolean;
  /** Whether to show copy button */
  showCopyButton?: boolean;
}

export interface CopyButtonProps {
  /** Text to copy to clipboard */
  text: string;
  /** Optional custom button text */
  label?: string;
  /** Custom CSS classes */
  className?: string;
}

export interface CopyButtonExtendedProps extends Omit<CopyButtonProps, "text"> {
  /** The text content to be copied to clipboard */
  content: string;
  /** Indicates if the parent CodeBlock has padding, to adjust button position */
  parentIsPadded?: boolean;
}

export interface MDXCodeBlockWrapperProps {
  /** Child code blocks */
  children: ReactNode;
  /** Optional wrapper title */
  title?: string;
}

export type MDXCodeBlockProps = CodeBlockProps;
