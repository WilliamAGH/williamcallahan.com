/**
 * CopyButton Component
 *
 * A button component that copies content (e.g., code in a code block) to clipboard with visual feedback
 *
 * @module components/ui/code-block/copy-button.client
 */

"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import type { CopyButtonExtendedProps as CopyButtonProps } from "@/types/ui";
import { cn } from "../../../lib/utils";

/**
 * A button component that copies content to clipboard with visual feedback
 * @component
 * @param {CopyButtonProps} props - The component props
 * @returns {JSX.Element} A button that copies text to clipboard
 */
export const CopyButton: React.FC<CopyButtonProps> = ({ content, className, parentIsPadded = false }) => {
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
      console.error("Failed to copy text:", err);
    }
  };

  // Count the number of lines in the content
  const lineCount = content.split("\n").length;

  // Determine positioning based on line count
  const isShortCode = lineCount <= 3;
  const rightPosition = parentIsPadded ? "right-6" : "right-2";
  const verticalPosition = isShortCode
    ? "top-1/2 -translate-y-1/2" // Centered for 3 or fewer lines
    : "top-2"; // Top-right for more than 3 lines

  return (
    <button
      type="button"
      data-testid="copy-button"
      data-content={content}
      onClick={() => void handleCopy()}
      className={cn(
        "absolute p-2 rounded-md backdrop-blur-sm",
        rightPosition,
        verticalPosition,
        "bg-gray-800/60 hover:bg-gray-700/60 dark:bg-gray-700/50 dark:hover:bg-gray-600/50",
        "text-gray-200 hover:text-white",
        "shadow-sm ring-1 ring-black/10 dark:ring-white/10",
        "transition-all duration-200",
        "focus:outline-none focus:ring-2 focus:ring-blue-500/40",
        "opacity-0 group-hover:opacity-100",
        className,
      )}
      title="Copy code"
      aria-label={copied ? "Copied!" : "Copy code"}
    >
      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
    </button>
  );
};

// Type assertion to ensure component type is correct
CopyButton.displayName = "CopyButton";
