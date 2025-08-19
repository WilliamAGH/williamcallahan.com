/**
 * Tags List Component
 *
 * Client component for rendering and filtering tags with "Show More" functionality.
 * Follows the hydration safety pattern described in README.md.
 */
"use client";

import { formatTagDisplay } from "@/lib/utils/tag-utils";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { TagsListClientProps } from "@/types";

export function TagsList({ tags, selectedTag, onTagSelectAction }: TagsListClientProps) {
  const [mounted, setMounted] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Set mounted flag after hydration is complete
  useEffect(() => {
    setMounted(true);
  }, []);

  // Using the shared tag formatter from utils

  const hasMoreTags = tags.length > 6;

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Filter by:</span>

      {/* Render all tags but cap visibility with CSS */}
      <div className="flex flex-wrap gap-2">
        {tags.map((tag, index) => (
          <button
            type="button"
            key={tag}
            onClick={() => mounted && onTagSelectAction(tag)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selectedTag === tag
                ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            } ${!mounted ? "pointer-events-none" : ""} ${index >= 6 && !showAllTags ? "hidden" : ""}`}
          >
            {formatTagDisplay(tag)}
          </button>
        ))}
      </div>

      {/* Show More/Less button: render a placeholder during SSR for layout stability */}
      {hasMoreTags && (
        <button
          type="button"
          onClick={() => mounted && setShowAllTags(!showAllTags)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-800/40 transition-colors border border-indigo-200 dark:border-indigo-800 ${!mounted ? "pointer-events-none" : ""}`}
        >
          {showAllTags ? "Show Less" : `+${tags.length - 6} More`}
        </button>
      )}

      {/* Clear filter button – always present to keep SSR/CSR markup identical */}
      <button
        type="button"
        onClick={() => {
          if (!mounted || !selectedTag) return;
          
          // Check if we're on a tag-specific route
          if (pathname.includes('/bookmarks/tags/')) {
            // Navigate back to the main bookmarks page
            router.push('/bookmarks');
          } else {
            // Otherwise, just clear the selected tag locally
            onTagSelectAction(selectedTag);
          }
        }}
        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
        style={{ visibility: mounted && selectedTag ? "visible" : "hidden" }}
        disabled={!mounted || !selectedTag}
      >
        Clear filter
      </button>
    </div>
  );
}
