"use client";

/**
 * @file Project Tags Client Component
 * @module components/features/projects/project-tags.client
 *
 * @description
 * Client component that handles project tag filtering.
 * This component displays interactive filter buttons and handles tag selection.
 *
 * @clientComponent - This component uses client-side APIs and must be rendered on the client.
 */

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { projects } from '@/data/projects';

/**
 * ProjectTags Client Component
 *
 * This component renders interactive filter buttons for project tags
 * and handles the filtering logic.
 */
export function ProjectTagsClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [selectedTag, setSelectedTag] = useState('All');

  // Get all unique tags from projects data
  const allTags = ['All', ...Array.from(new Set(projects.flatMap(p => p.tags || []))).sort()];

  // Initialize selected tag from URL query params
  useEffect(() => {
    const tagParam = searchParams.get('tag');
    if (tagParam) {
      setSelectedTag(tagParam);
    }
  }, [searchParams]);

  // Handle tag selection
  const handleTagSelect = (tag: string) => {
    setSelectedTag(tag);

    // Update URL with the selected tag
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
    <div className="flex flex-wrap gap-2 mb-8 px-6 sm:px-4 pt-6">
      {allTags.map(tag => (
        <button
          key={tag}
          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors duration-200 ${
            selectedTag === tag
              ? "bg-blue-600 text-white"
              : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
          }`}
          onClick={() => handleTagSelect(tag)}
          aria-pressed={selectedTag === tag}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}