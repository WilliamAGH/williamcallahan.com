'use client';

import { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface CollapseDropdownProps {
  /** The text or element to display in the summary/trigger */
  summary: ReactNode;
  /** The content to be revealed when expanded */
  children: ReactNode;
  /** Optional CSS class name for the details element */
  className?: string;
  /** Optional CSS class name for the summary element */
  summaryClassName?: string;
  /** Optional CSS class name for the content wrapper */
  contentClassName?: string;
  /** Whether the dropdown should be open by default */
  defaultOpen?: boolean;
}

/**
 * CollapseDropdown Component
 *
 * A styled wrapper around the native HTML <details> and <summary> elements
 * for creating accessible expand/collapse sections (dropdowns).
 *
 * @component
 * @param {CollapseDropdownProps} props - Component props
 * @returns {JSX.Element} Rendered component
 */
export function CollapseDropdown({
  summary,
  children,
  className = '',
  summaryClassName = '',
  contentClassName = '',
  defaultOpen = false
}: CollapseDropdownProps): JSX.Element {
  return (
    <details
      className={cn("my-6 group", className)} // Added my-6 for spacing
      open={defaultOpen}
    >
      <summary
        className={cn(
          "text-lg font-semibold cursor-pointer list-none", // list-none removes default marker, removed mb-4
          "flex items-center gap-2", // Use flex for icon alignment
          "p-3 rounded-md border", // Added padding, rounded corners, border
          "bg-slate-50 dark:bg-slate-800/50", // Added background
          "border-slate-200 dark:border-slate-700", // Added border colors
          "transition-colors duration-150", // Added transition
          "hover:bg-slate-100 dark:hover:bg-slate-700/50", // Changed hover to background change
          summaryClassName
        )}
      >
        {/* Default arrow icon using Tailwind */}
        <span className="transition-transform duration-200 group-open:rotate-90 flex-shrink-0"> {/* Added flex-shrink-0 */}
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-right"><path d="m9 18 6-6-6-6"/></svg>
        </span>
        {/* Ensure summary text doesn't overflow weirdly */}
        <span className="flex-grow">{summary}</span>
      </summary>
      {/* Content container with improved styling */}
      <div className={cn(
        "ml-6 mt-4 mb-4",
        "prose prose-sm dark:prose-invert max-w-none", // Base prose styling
        "overflow-visible",
        // General code formatting (applied first)
        "[&_code]:text-sm [&_code]:break-words [&_code]:whitespace-normal",
        // Specific overrides for CODE inside LINKS:
        "[&_a>code]:text-blue-600 dark:[&_a>code]:text-blue-400", // Force link color
        "[&_a>code]:bg-transparent dark:[&_a>code]:bg-transparent", // Remove background
        "[&_a>code]:px-0 [&_a>code]:py-0", // Remove padding
        "[&_a:hover>code]:text-blue-500 dark:[&_a:hover>code]:text-blue-300", // Hover color
        // Pre/code block formatting
        "[&_pre]:overflow-x-auto [&_pre]:my-2",
        // List formatting
        "[&_ul]:pl-5 [&_li]:ml-0 [&_li]:my-1",
        contentClassName
      )}>
        {children}
      </div>
    </details>
  );
}
