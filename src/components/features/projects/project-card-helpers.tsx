/**
 * Shared helpers for project card components
 * @module components/features/projects/project-card-helpers
 */

import type { JSX } from "react";

/** Maximum number of technology items to display on project cards */
export const MAX_DISPLAY_TECH_ITEMS = 10;

/** Technology keywords recognized for deriving tech stack from tags */
const TECH_KEYWORDS = new Set([
  "Next.js",
  "TypeScript",
  "Tailwind CSS",
  "React",
  "MDX",
  "Server Components",
  "Java",
  "Spring Boot",
  "Spring AI",
  "OpenAI",
  "Google Books API",
  "Thymeleaf",
  "HTMX",
  "PostgreSQL",
  "Docker",
  "Groq",
  "Gemini",
]);

/**
 * Derives a technology stack from project tags by filtering for known tech keywords.
 * Used when an explicit techStack is not provided.
 */
export function deriveTechFromTags(tagList: string[] | undefined): string[] {
  if (!tagList || tagList.length === 0) return [];
  return tagList.filter((t) => TECH_KEYWORDS.has(t));
}

/**
 * Placeholder component displayed when a project has no image.
 * Renders a gradient background with a centered image icon.
 */
export function PlaceholderImageTop(): JSX.Element {
  return (
    <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center text-gray-400 dark:text-gray-500 rounded-md">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Placeholder image"
        className="h-16 w-16 opacity-50"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        role="img"
      >
        <title>Placeholder image</title>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    </div>
  );
}
