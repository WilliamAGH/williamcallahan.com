/**
 * Share Button Component
 *
 * A button that copies a bookmark's URL to the clipboard and shows a success animation.
 *
 * @module components/features/bookmarks/share-button.client
 */
"use client";

import { useState, useEffect, useRef, type JSX } from 'react';
import { Check } from 'lucide-react';
import { generateUniqueSlug } from '@/lib/utils/domain-utils';
import type { UnifiedBookmark } from '@/types';
import { useFixSvgTransforms } from '@/lib/hooks/use-fix-svg-transforms';

interface ShareButtonProps {
  bookmark: Pick<UnifiedBookmark, 'id' | 'url'>;
  allBookmarks: Array<Pick<UnifiedBookmark, 'id' | 'url'>>;
}

export function ShareButton({ bookmark, allBookmarks }: ShareButtonProps): JSX.Element {
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);

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

  // Generate the slug for this bookmark
  const getBookmarkUrl = () => {
    const slug = generateUniqueSlug(bookmark.url, allBookmarks, bookmark.id);
    // Get the base URL (works in both development and production)
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return `${baseUrl}/bookmarks/${slug}`;
  };

  const handleCopy = async () => {
    try {
      // Generate the unique URL for this bookmark
      const bookmarkUrl = getBookmarkUrl();

      // Copy to clipboard
      await navigator.clipboard.writeText(bookmarkUrl);

      // Show success state
      setCopied(true);
      setTooltipVisible(true);

      // Hide tooltip after a delay
      setTimeout(() => {
        setTooltipVisible(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy URL:', error);
      // Could show an error state here
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
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 50 50"
            width={24}
            height={24}
            className="text-gray-500 dark:text-gray-400"
            data-transform-fix="true"
          >
            <path fill="currentColor" d="M30.3 13.7L25 8.4l-5.3 5.3-1.4-1.4L25 5.6l6.7 6.7z"/>
            <path fill="currentColor" d="M24 7h2v21h-2z"/>
            <path fill="currentColor" d="M35 40H15c-1.7 0-3-1.3-3-3V19c0-1.7 1.3-3 3-3h7v2h-7c-.6 0-1 .4-1 1v18c0 .6.4 1 1 1h20c.6 0 1-.4 1-1V19c0-.6-.4-1-1-1h-7v-2h7c1.7 0 3 1.3 3 3v18c0 1.7-1.3 3-3 3z"/>
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
      >
        {copied ? (
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
            <path fill="currentColor" d="M30.3 13.7L25 8.4l-5.3 5.3-1.4-1.4L25 5.6l6.7 6.7z"/>
            <path fill="currentColor" d="M24 7h2v21h-2z"/>
            <path fill="currentColor" d="M35 40H15c-1.7 0-3-1.3-3-3V19c0-1.7 1.3-3 3-3h7v2h-7c-.6 0-1 .4-1 1v18c0 .6.4 1 1 1h20c.6 0 1-.4 1-1V19c0-.6-.4-1-1-1h-7v-2h7c1.7 0 3 1.3 3 3v18c0 1.7-1.3 3-3 3z"/>
          </svg>
        )}
      </button>

      {/* Tooltip - simplified for minimal hydration issues */}
      {tooltipVisible && (
        <div className="absolute top-[-30px] left-1/2 transform -translate-x-1/2 bg-black text-white text-xs py-1 px-2 rounded shadow-sm whitespace-nowrap z-20">
          Link copied!
        </div>
      )}
    </div>
  );
}