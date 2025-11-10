"use client";

/**
 * @file Project Tags Client Component
 * @module components/features/projects/project-tags.client
 *
 * @description
 * Client-side component responsible for rendering and managing project tag filters.
 * It allows users to select tags to filter a list of projects, displays a limited
 * number of tags initially, and provides a "Show More" / "Show Less" functionality
 * to toggle the visibility of all available tags. The component interacts with URL
 * search parameters to reflect and respond to the current filter state.
 *
 * @clientComponent This component uses client-side React hooks (`useState`, `useEffect`)
 * and Next.js client utilities (`useSearchParams`, `useRouter`), and is therefore
 * marked as a client component.
 */

import { projects } from "@/data/projects";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const TAG_LIMIT = 10; // Number of tags to show initially

/**
 * Renders interactive filter buttons for project tags and handles filtering logic.
 *
 * This component displays a list of project tags as buttons. Users can click these
 * buttons to filter projects. It includes a "Show More" feature to reveal additional
 * tags if the total number of unique tags exceeds `TAG_LIMIT`. The component
 * synchronizes the selected tag with the URL's query parameters.
 *
 * @returns {React.JSX.Element} The rendered project tags filtering interface.
 */
export function ProjectTagsClient(): React.JSX.Element {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [selectedTag, setSelectedTag] = useState("All");
  const [mounted, setMounted] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);

  // Get all unique tags from projects data, excluding "All" for counting purposes
  const uniqueProjectTags = Array.from(new Set(projects.flatMap(p => p.tags || []))).toSorted();
  const allTags = ["All", ...uniqueProjectTags];

  // Determine if there are more tags than the limit (excluding "All")
  const hasMoreTags = uniqueProjectTags.length > TAG_LIMIT;

  /**
   * Effect hook to handle component mounting and initialize selected tag from URL.
   * Sets `mounted` to true after client-side hydration.
   * Reads the 'tag' search parameter from the URL and updates `selectedTag` state if present.
   */
  useEffect(() => {
    setMounted(true); // Set mounted after hydration
    const tagParam = searchParams.get("tag");
    if (tagParam) {
      setSelectedTag(tagParam);
    }
  }, [searchParams]);

  /**
   * Handles the selection of a project tag.
   * Updates the `selectedTag` state and modifies the URL search parameters
   * to reflect the new filter. Navigates to the new URL.
   *
   * @param {string} tag - The tag that was selected by the user.
   */
  const handleTagSelect = (tag: string): void => {
    setSelectedTag(tag);
    const params = new URLSearchParams(searchParams);
    if (tag === "All") {
      params.delete("tag");
    } else {
      params.set("tag", tag);
    }
    const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    router.push(newUrl);
  };

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-3 mb-8 px-4 pt-6">
      <div className="flex flex-wrap gap-2 items-center">
        {allTags.map((tag, index) => (
          <button
            type="button" // Added type="button" for accessibility (lint/a11y/useButtonType)
            key={tag}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors duration-200 ${
              selectedTag === tag
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
            } ${!mounted ? "pointer-events-none opacity-50" : ""} ${
              // Hide tags beyond the limit if not "All" tag and showAllTags is false
              // The "All" tag (index 0) is always visible.
              // For other tags, their effective index for limiting is `index - 1`.
              tag !== "All" && index - 1 >= TAG_LIMIT && !showAllTags ? "hidden" : ""
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
          type="button" // Added type="button" for accessibility (lint/a11y/useButtonType)
          onClick={() => setShowAllTags(!showAllTags)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-800/40 transition-colors border border-indigo-200 dark:border-indigo-800 self-start"
        >
          {showAllTags ? "Show Less" : `+${uniqueProjectTags.length - TAG_LIMIT} More Tags`}
        </button>
      )}
    </div>
  );
}
