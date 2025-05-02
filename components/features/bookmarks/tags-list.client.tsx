/**
 * Tags List Component
 * 
 * Client component for rendering and filtering tags with "Show More" functionality.
 * Follows the hydration safety pattern described in README.md.
 */
"use client";

import React, { useState, useEffect } from 'react';
import { formatTagDisplay } from '@/lib/utils/tag-utils';

interface TagsListProps {
  tags: string[];
  selectedTag: string | null;
  onTagSelect: (tag: string) => void;
}

// Initial set of default tags that are used during SSR and hydration
const INITIAL_TAGS = [
  "AI", 
  "Cloud Deployment", 
  "UI Components", 
  "LLM", 
  "Web Development",
  "Product Design"
];

export function TagsList({ tags, selectedTag, onTagSelect }: TagsListProps) {
  const [mounted, setMounted] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);
  
  // Set mounted flag after hydration is complete
  useEffect(() => { 
    setMounted(true);
  }, []);

  // Using the shared tag formatter from utils

  // Only show the first 6 tags (or all if showAllTags is true)
  const visibleTags = showAllTags ? tags : tags.slice(0, 6);
  const hasMoreTags = tags.length > 6;

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Filter by:</span>
      
      {/* Render all tags but cap visibility with CSS */}
      <div className="flex flex-wrap gap-2">
        {tags.map((tag, index) => (
          <button
            key={tag}
            onClick={() => mounted && onTagSelect(tag)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selectedTag === tag
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            } ${!mounted ? 'pointer-events-none' : ''} ${index >= 6 && !showAllTags ? 'hidden' : ''}`} 
          >
            {formatTagDisplay(tag)}
          </button>
        ))}
      </div>
      
      {/* Show More/Less button: render a placeholder during SSR for layout stability */}
      {hasMoreTags && (
        <button
          onClick={() => mounted && setShowAllTags(!showAllTags)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-800/40 transition-colors border border-indigo-200 dark:border-indigo-800 ${!mounted ? 'pointer-events-none' : ''}`}
        >
          {showAllTags ? "Show Less" : `+${tags.length - 6} More`}
        </button>
      )}
      
      {/* Only show the Clear button client-side where it's functional */}
      {mounted && selectedTag && (
        <button
          onClick={() => onTagSelect(selectedTag)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
        >
          Clear filter
        </button>
      )}
    </div>
  );
}