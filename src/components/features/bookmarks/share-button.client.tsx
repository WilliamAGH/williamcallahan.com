/**
 * Share Button Component
 *
 * A button that copies a bookmark's URL to the clipboard and shows a success animation.
 *
 * @module components/features/bookmarks/share-button.client
 */
"use client";

import { useFixSvgTransforms } from "@/lib/hooks/use-fix-svg-transforms";
import { NEXT_PUBLIC_SITE_URL } from "@/lib/constants/client";
import type { BookmarkShareButtonProps } from "@/types";
import { Check } from "lucide-react";
import { type JSX, useEffect, useRef, useState } from "react";

export function ShareButton({ shareUrl }: BookmarkShareButtonProps): JSX.Element {
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  // Create refs for the buttons to fix SVG transform issues
  const placeholderButtonRef = useRef<HTMLButtonElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Apply SVG transform fixes to both button refs
  useFixSvgTransforms({ rootRef: buttonRef });
  useFixSvgTransforms({ rootRef: placeholderButtonRef });

  // Track mounted state for hydration safety
  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset copied state after animation
  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => {
        setCopied(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  // Get the full URL for sharing
  const resolveBaseUrl = (): string => {
    if (typeof window === "undefined") {
      return NEXT_PUBLIC_SITE_URL;
    }

    const origin = window.location.origin;

    if (!origin || origin === "null" || origin === "file://" || origin === "about:blank") {
      return NEXT_PUBLIC_SITE_URL;
    }

    return origin;
  };

  const getBookmarkUrl = () => {
    const baseUrl = resolveBaseUrl();

    try {
      return new URL(shareUrl, baseUrl).toString();
    } catch {
      const trimmedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
      return `${trimmedBase}${shareUrl}`;
    }
  };

  const copyUsingFallback = (text: string): boolean => {
    if (typeof document === "undefined") {
      return false;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);

    const selection = document.getSelection();
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    textarea.select();

    let succeeded = false;
    try {
      succeeded = document.execCommand("copy");
    } catch {
      succeeded = false;
    }

    document.body.removeChild(textarea);

    if (range && selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }

    return succeeded;
  };

  const showTooltip = (failed: boolean) => {
    setCopyFailed(failed);
    setTooltipVisible(true);
    setTimeout(() => {
      setTooltipVisible(false);
      setCopyFailed(false);
    }, 2000);
  };

  const handleCopy = async () => {
    try {
      const bookmarkUrl = getBookmarkUrl();
      let copySucceeded = false;

      const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
      if (clipboard?.writeText) {
        try {
          await clipboard.writeText(bookmarkUrl);
          copySucceeded = true;
        } catch (clipboardError) {
          console.warn(
            "navigator.clipboard.writeText failed, falling back to execCommand",
            clipboardError,
          );
        }
      }

      if (!copySucceeded) {
        copySucceeded = copyUsingFallback(bookmarkUrl);
      }

      if (copySucceeded) {
        showTooltip(false);
        setCopied(true);
        return;
      }

      showTooltip(true);
      setCopied(false);
    } catch (error) {
      console.error("Failed to copy URL:", error);
      showTooltip(true);
      setCopied(false);
    }
  };

  // During SSR, render a placeholder button for layout stability
  if (!mounted) {
    return (
      <div className="relative">
        <button
          ref={placeholderButtonRef}
          data-transform-fix-container="true"
          className="p-2 text-gray-500 dark:text-gray-400 transition-colors pointer-events-none"
          aria-label="Copy link"
          disabled
          type="button"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 50 50"
            width={24}
            height={24}
            className="text-gray-500 dark:text-gray-400"
            data-transform-fix="true"
          >
            <title>Copy link icon</title>
            <path fill="currentColor" d="M30.3 13.7L25 8.4l-5.3 5.3-1.4-1.4L25 5.6l6.7 6.7z" />
            <path fill="currentColor" d="M24 7h2v21h-2z" />
            <path
              fill="currentColor"
              d="M35 40H15c-1.7 0-3-1.3-3-3V19c0-1.7 1.3-3 3-3h7v2h-7c-.6 0-1 .4-1 1v18c0 .6.4 1 1 1h20c.6 0 1-.4 1-1V19c0-.6-.4-1-1-1h-7v-2h7c1.7 0 3 1.3 3 3v18c0 1.7-1.3 3-3 3z"
            />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => void handleCopy()}
        data-transform-fix-container="true"
        className="p-2 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        aria-label="Copy link"
        type="button"
      >
        {copied && !copyFailed ? (
          <Check className="w-6 h-6 text-green-500" />
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 50 50"
            width={24}
            height={24}
            className="text-gray-500 dark:text-gray-400"
            data-transform-fix="true"
          >
            <title>Copy link icon</title>
            <path fill="currentColor" d="M30.3 13.7L25 8.4l-5.3 5.3-1.4-1.4L25 5.6l6.7 6.7z" />
            <path fill="currentColor" d="M24 7h2v21h-2z" />
            <path
              fill="currentColor"
              d="M35 40H15c-1.7 0-3-1.3-3-3V19c0-1.7 1.3-3 3-3h7v2h-7c-.6 0-1 .4-1 1v18c0 .6.4 1 1 1h20c.6 0 1-.4 1-1V19c0-.6-.4-1-1-1h-7v-2h7c1.7 0 3 1.3 3 3v18c0 1.7-1.3 3-3 3z"
            />
          </svg>
        )}
      </button>

      {/* Tooltip - simplified for minimal hydration issues */}
      {tooltipVisible && (
        <div className="absolute top-[-30px] left-1/2 transform -translate-x-1/2 bg-black text-white text-xs py-1 px-2 rounded shadow-sm whitespace-nowrap z-20">
          {copyFailed ? "Copy failed" : "Link copied!"}
        </div>
      )}
    </div>
  );
}
