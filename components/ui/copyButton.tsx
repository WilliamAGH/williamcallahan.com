// components/ui/copyButton.tsx

'use client';

import { useState, useCallback } from 'react';

/**
 * Props for the CopyButton component
 * @interface CopyButtonProps
 */
interface CopyButtonProps {
  /** The text content to be copied to clipboard */
  content: string;
}

/**
 * SVG icon properties type definition
 * @interface IconProps
 */
interface IconProps {
  className?: string;
}

/**
 * Check mark icon component
 * @component
 */
const CheckIcon: React.FC<IconProps> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/**
 * Copy icon component
 * @component
 */
const CopyIcon: React.FC<IconProps> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

/**
 * A button component that copies content to clipboard with visual feedback
 * @component
 * @param {CopyButtonProps} props - The component props
 * @returns {JSX.Element} A button that copies text to clipboard
 */
export const CopyButton: React.FC<CopyButtonProps> = ({ content }) => {
  /** State to track if content was copied */
  const [copied, setCopied] = useState(false);

  /**
   * Handle copying content to clipboard
   * @function handleClick
   */
  const handleClick = useCallback(() => {
    // Set state immediately
    setCopied(true);

    // Attempt to copy to clipboard
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(content)
        .catch((error: unknown) => {
          console.error('Failed to copy text:', error);
          setCopied(false);
        });
    } else {
      console.error('Failed to copy text:', new Error('Clipboard API not available'));
      setCopied(false);
    }
  }, [content]);

  return (
    <button
      onClick={handleClick}
      className="absolute top-2 right-2 p-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
      aria-label={copied ? 'Copied!' : 'Copy code'}
      title={copied ? 'Copied!' : 'Copy code'}
      type="button"
      data-testid="copy-button"
      data-content={content}
    >
      {copied ? (
        <CheckIcon className="text-green-400" />
      ) : (
        <CopyIcon className="text-gray-300" />
      )}
    </button>
  );
};

// Type assertion to ensure component type is correct
CopyButton.displayName = 'CopyButton';
