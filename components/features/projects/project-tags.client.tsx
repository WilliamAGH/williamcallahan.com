"use client";

/**
 * @file Project Tags Client Component
 * @module components/features/projects/project-tags.client
 *
 * @description
 * Client component that handles project tag filtering with "Show More" functionality.
 * This component displays interactive filter buttons and handles tag selection.
 *
 * @clientComponent - This component uses client-side APIs and must be rendered on the client.
 */

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { projects } from '@/data/projects';

const TAG_LIMIT = 10; // Number of tags to show initially

/**
 * ProjectTags Client Component
 *
 * This component renders interactive filter buttons for project tags
 * and handles the filtering logic, including a "Show More" feature.
 */
export function ProjectTagsClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [selectedTag, setSelectedTag] = useState('All');
  const [mounted, setMounted] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);

  // Get all unique tags from projects data, excluding "All" for counting purposes
  const uniqueProjectTags = Array.from(new Set(projects.flatMap(p => p.tags || []))).sort();
  const allTags = ['All', ...uniqueProjectTags];

  // Determine if there are more tags than the limit (excluding "All")
  const hasMoreTags = uniqueProjectTags.length > TAG_LIMIT;

  useEffect(() => {
    setMounted(true); // Set mounted after hydration
    const tagParam = searchParams.get('tag');
    if (tagParam) {
      setSelectedTag(tagParam);
    }
  }, [searchParams]);

  const handleTagSelect = (tag: string) => {
    setSelectedTag(tag);
    const params = new URLSearchParams(searchParams);
    if (tag === 'All') {
      params.delete('tag');
    } else {
      params.set('tag', tag);
    }
    const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    router.push(newUrl);
  };

  return (
    <div className="flex flex-col gap-3 mb-8 px-6 sm:px-4 pt-6">
      <div className="flex flex-wrap gap-2 items-center">
        {allTags.map((tag, index) => (
          <button
            key={tag}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors duration-200 ${
              selectedTag === tag
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
            } ${!mounted ? 'pointer-events-none opacity-50' : ''} ${
              // Hide tags beyond the limit if not "All" tag and showAllTags is false
              // The "All" tag (index 0) is always visible.
              // For other tags, their effective index for limiting is `index - 1`.
              tag !== 'All' && (index -1) >= TAG_LIMIT && !showAllTags ? 'hidden' : ''
            }`}
            onClick={() => mounted && handleTagSelect(tag)}
            aria-pressed={selectedTag === tag}
            disabled={!mounted}
          >
            {tag}
          </button>
        ))}
      </div>
      {mounted && hasMoreTags && (
        <button
          onClick={() => setShowAllTags(!showAllTags)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-800/40 transition-colors border border-indigo-200 dark:border-indigo-800 self-start"
        >
          {showAllTags ? "Show Less" : `+${uniqueProjectTags.length - TAG_LIMIT} More Tags`}
        </button>
      )}
    </div>
  );
}