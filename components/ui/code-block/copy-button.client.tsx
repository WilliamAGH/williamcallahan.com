/**
 * CopyButton Component
 *
 * A button component that copies content (e.g., code in a code block) to clipboard with visual feedback
 *
 * @module components/ui/code-block/copy-button.client
 */

'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '../../../lib/utils';

/**
 * Props for the CopyButton component
 * @interface CopyButtonProps
 */
interface CopyButtonProps {
  /** The text content to be copied to clipboard */
  content: string;
  className?: string;
}

/**
 * A button component that copies content to clipboard with visual feedback
 * @component
 * @param {CopyButtonProps} props - The component props
 * @returns {JSX.Element} A button that copies text to clipboard
 */
export const CopyButton: React.FC<CopyButtonProps> = ({ content, className }) => {
  /** State to track if content was copied */
  const [copied, setCopied] = useState(false);

  /**
   * Handle copying content to clipboard
   * @function handleCopy
   */
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  return (
    <button
      onClick={() => void handleCopy()}
      className={cn(
        'absolute right-2 top-2 p-2 rounded-md',
        'bg-gray-700/60 hover:bg-gray-600/60',
        'text-gray-300 hover:text-gray-100',
        'transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-blue-500/40',
        className
      )}
      title="Copy code"
      aria-label={copied ? "Copied!" : "Copy code"}
    >
      {copied ? (
        <Check className="w-4 h-4 text-green-400" />
      ) : (
        <Copy className="w-4 h-4" />
      )}
    </button>
  );
};

// Type assertion to ensure component type is correct
CopyButton.displayName = 'CopyButton';
