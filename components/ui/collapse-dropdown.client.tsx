/**
 * CollapseDropdown Component
 *
 * @module components/ui/collapse-dropdown.client
 * @description
 * A styled wrapper around the native HTML <details> and <summary> elements
 * for creating accessible expand/collapse sections (dropdowns).
 */

'use client';

import { ReactNode, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation'; // Import usePathname
import { cn } from '../../lib/utils';

// Create a registry of all dropdowns so we can find them by related anchors
// This is globally accessible across all instances of CollapseDropdown
const dropdownRegistry: {[key: string]: HTMLDetailsElement} = {};

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
  /** Optional ID for direct anchor targeting */
  id?: string;
}

// A global function to check URL hash and open relevant dropdown
// We'll call this after page load and after navigation
function checkUrlHashForDropdowns(attempt = 1, maxAttempts = 5) {
  if (!window.location.hash) return;

  const hash = window.location.hash.slice(1);
  if (process.env.NODE_ENV === 'development') {
    console.log('Global hash check:', hash, 'attempt:', attempt);
  }
  let dropdownToOpen = null;
  let targetElement = null;

  // First, check if we have an exact ID match in our registry
  if (dropdownRegistry[hash]) {
    if (process.env.NODE_ENV === 'development') {
      console.log('Found exact dropdown match:', hash);
    }
    dropdownToOpen = dropdownRegistry[hash];
  } else {
    // If no exact match, check if any dropdown contains keywords from the hash
    const hashWords = hash.split('-').filter(Boolean);
    for (const [id, detailsElement] of Object.entries(dropdownRegistry)) {
      // Check if most words from hash match this dropdown id
      const matchCount = hashWords.filter(word => id.includes(word)).length;
      if (matchCount > 0 && matchCount >= hashWords.length * 0.5) { // At least half the words match
        if (process.env.NODE_ENV === 'development') {
          console.log('Found partial dropdown match:', id, 'for hash:', hash);
        }
        dropdownToOpen = detailsElement;
        break;
      }
    }

    // See if the target element exists
    targetElement = document.getElementById(hash);
    if (targetElement && !dropdownToOpen) {
      // Check all dropdowns to see if the target is inside
      for (const detailsElement of Object.values(dropdownRegistry)) {
        if (detailsElement.contains(targetElement)) {
          if (process.env.NODE_ENV === 'development') {
            console.log('Found dropdown containing element:', hash);
          }
          dropdownToOpen = detailsElement;
          break;
        }
      }
    }
  }

  // If we found a dropdown to open, do it once and then scroll
  if (dropdownToOpen) {
    // First open the dropdown
    dropdownToOpen.open = true;

    // Prevent browser's automatic scrolling
    if (history.replaceState) {
      history.replaceState(null, document.title, window.location.pathname + window.location.search);
    }

    // Wait for DOM update, then scroll to target
    setTimeout(() => {
      if (process.env.NODE_ENV === 'development') {
        console.log('Attempting to scroll to:', hash);
      }

      // Try element by ID first
      const element = document.getElementById(hash);
      if (element) {
        element.scrollIntoView({ block: 'start' }); // No smooth scrolling
        return;
      }

      // Try an anchor with matching ID
      const anchor = document.querySelector(`a[id="${hash}"]`);
      if (anchor) {
        anchor.scrollIntoView({ block: 'start' });
        return;
      }

      // Restore the hash to enable browser's native scrolling as a fallback
      // Wait for the next paint cycle after opening the details element
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (process.env.NODE_ENV === 'development') {
            console.log('Scrolling to:', hash);
          }
          // Try element by ID first
          const element = document.getElementById(hash);
          if (element) {
            element.scrollIntoView({ block: 'start' }); // No smooth scrolling
            return;
          }

          // Try an anchor with matching ID
          const anchor = document.querySelector(`a[id="${hash}"]`);
          if (anchor) {
            anchor.scrollIntoView({ block: 'start' });
            return;
          }

          // Restore the hash to enable browser's native scrolling as a fallback
          // Only restore if we couldn't find the element/anchor after opening
          window.location.hash = hash;
        });
      });
    }); // End requestAnimationFrame
  } else if (attempt < maxAttempts) {
    // If we didn't find the dropdown and haven't exceeded max attempts,
    // try again with exponential backoff
    const delay = Math.min(200 * Math.pow(2, attempt - 1), 3000); // Cap at 3 seconds
    if (process.env.NODE_ENV === 'development') {
      console.log(`Retrying hash check in ${delay}ms (attempt ${attempt + 1}/${maxAttempts})`);
    }
    setTimeout(() => checkUrlHashForDropdowns(attempt + 1, maxAttempts), delay);
  }
}

// Set up global hash change listener for same-page hash changes AFTER initial load
if (typeof window !== 'undefined') {
  // REMOVE the 'load' listener - initial check is handled by component registration effect
  // window.addEventListener('load', () => {
  //   checkUrlHashForDropdowns();
  // });

  // Keep 'hashchange' listener for clicks on same-page anchors
  window.addEventListener('hashchange', () => {
    // Add a small delay to allow potential state updates before checking
    setTimeout(() => checkUrlHashForDropdowns(), 100);
  });
}

// Remove commented out global listeners block as well
// if (typeof window !== 'undefined') {
//   // Handle initial page load with hash
//   window.addEventListener('load', () => {
//     // Start checking immediately after load
//     checkUrlHashForDropdowns();
//   });
//
//   // Handle navigation to a hash
//   window.addEventListener('hashchange', () => {
//     checkUrlHashForDropdowns();
//   });
// }

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
  defaultOpen = false,
  id
}: CollapseDropdownProps): JSX.Element {
  // Ref to access the details element
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname(); // Get current pathname

  // Effect to register this dropdown AND handle initial hash check + route changes
  useEffect(() => {
    // Skip if no ref or no summary
    if (!detailsRef.current || !summary) return;

    // Generate ID if not provided
    let dropdownId = id || '';
    if (!dropdownId && typeof summary === 'string') {
      dropdownId = summary.toLowerCase()
        .replace(/^\d+\.\d+:\s+/, '') // Remove section numbers like "6.1: "
        .replace(/\s+/g, '-')        // Replace spaces with hyphens
        .replace(/[^a-z0-9-_]/g, ''); // Remove special chars
    }

    // Only register if we have an ID
    if (dropdownId) {
      if (process.env.NODE_ENV === 'development') {
        console.log('Registering dropdown:', dropdownId);
      }
      dropdownRegistry[dropdownId] = detailsRef.current;

      // Check if the current hash matches THIS dropdown right after registration
      const currentHashValue = window.location.hash ? window.location.hash.slice(1) : '';
      if (currentHashValue && (currentHashValue === dropdownId || currentHashValue.includes(dropdownId))) {
        if (process.env.NODE_ENV === 'development') {
          console.log('Dropdown registration matches current hash, triggering check:', dropdownId);
        }
        // Use timeout 0 to defer check slightly, allowing other components to potentially mount
        setTimeout(() => checkUrlHashForDropdowns(), 0);
        // No need to manually open here, checkUrlHashForDropdowns handles it
      }
    }

    // Cleanup on unmount
    return () => {
      if (dropdownId) {
        delete dropdownRegistry[dropdownId];
      }
    };
  }, [summary, id]); // Keep original dependencies for registration

  // REMOVE the separate effect that checked hash based on pathname/currentHash
  // // Get the current hash safely outside the effect to satisfy exhaustive-deps
  // const currentHash = typeof window !== 'undefined' ? window.location.hash : '';
  //
  // // Effect to handle hash checking on mount and route/hash changes
  // useEffect(() => {
  //   // Check hash on initial mount or when path/hash changes
  //   if (currentHash) {
  //     // Use a small delay to allow other components (like MDX content) to potentially render
  //     const timer = setTimeout(() => {
  //       checkUrlHashForDropdowns();
  //     }, 50); // Reduced delay, rAF handles the scroll timing
  //     return () => clearTimeout(timer); // Cleanup timeout
  //   }
  //   // No cleanup needed if there's no hash initially
  // }, [pathname, currentHash]); // Depend on pathname and the calculated hash

  return (
    <details
      ref={detailsRef}
      className={cn("my-6 group", className)}
      open={defaultOpen}
    >
      <summary
        style={{ listStyle: 'none' }} // Explicitly hide the default marker
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
