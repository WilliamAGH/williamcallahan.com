/**
 * CollapseDropdown Component & Anchor Handling Logic
 *
 * @module components/ui/collapse-dropdown.client
 * @description Provides the CollapseDropdown component and centralized logic
 *              for handling anchor links targeting elements within these dropdowns.
 */
'use client';

import { ReactNode, useRef, useEffect } from 'react';
import { cn } from '../../lib/utils';

// --- Centralized Dropdown Registry and Logic ---

const dropdownRegistry: { [key: string]: HTMLDetailsElement } = {};
const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Registers a dropdown instance.
 * @param id The unique ID of the dropdown.
 * @param element The HTMLDetailsElement reference.
 */
export function registerDropdown(id: string, element: HTMLDetailsElement): void {
  if (isDevelopment) {
    console.log(`[Anchor Debug] Registering dropdown: ${id}`);
  }
  dropdownRegistry[id] = element;
}

/**
 * Unregisters a dropdown instance.
 * @param id The unique ID of the dropdown.
 */
export function unregisterDropdown(id: string): void {
  if (isDevelopment) {
    console.log(`[Anchor Debug] Unregistering dropdown: ${id}`);
  }
  delete dropdownRegistry[id];
}

/**
 * Attempts to find the dropdown element associated with a given hash.
 * Checks for exact ID match first, then partial match, then containment.
 * @param hash The URL hash (without '#').
 * @returns The HTMLDetailsElement or null if not found.
 */
export function findDropdownForHash(hash: string): HTMLDetailsElement | null {
  if (isDevelopment) {
    console.log(`[Anchor Debug] findDropdownForHash: Searching for dropdown related to #${hash}`);
  }

  // 1. Exact ID match in registry
  if (dropdownRegistry[hash]) {
    if (isDevelopment) {
      console.log(`[Anchor Debug] findDropdownForHash: Found exact match for #${hash}`);
    }
    return dropdownRegistry[hash];
  }

  // 2. Partial ID match (if no exact match)
  const hashWords = hash.split('-').filter(Boolean);
  for (const [id, detailsElement] of Object.entries(dropdownRegistry)) {
    const matchCount = hashWords.filter(word => id.includes(word)).length;
    if (matchCount > 0 && matchCount >= hashWords.length * 0.5) {
      if (isDevelopment) {
        console.log(`[Anchor Debug] findDropdownForHash: Found partial match '${id}' for #${hash}`);
      }
      return detailsElement;
    }
  }

  // 3. Check if target element exists and is inside a registered dropdown
  const targetElement = document.getElementById(hash);
  if (targetElement) {
    for (const [id, detailsElement] of Object.entries(dropdownRegistry)) {
      if (detailsElement.contains(targetElement)) {
        if (isDevelopment) {
          console.log(`[Anchor Debug] findDropdownForHash: Found element #${hash} inside dropdown '${id}'`);
        }
        return detailsElement;
      }
    }
  }

  if (isDevelopment) {
    console.log(`[Anchor Debug] findDropdownForHash: No dropdown found for #${hash}`);
  }
  return null;
}

/**
 * Opens a specific dropdown and attempts to scroll to the target hash within it, with retries.
 * @param dropdownToOpen The HTMLDetailsElement to open.
 * @param hash The target hash (without '#').
 */
export function openAndScrollToDropdownAnchor(dropdownToOpen: HTMLDetailsElement, hash: string): void {
  if (isDevelopment) {
    console.log(`[Anchor Debug] openAndScrollToDropdownAnchor: Opening dropdown for #${hash}.`);
  }
  dropdownToOpen.open = true;

  // Prevent browser's automatic scrolling immediately after opening
  if (history.replaceState) {
    history.replaceState(null, document.title, window.location.pathname + window.location.search);
  }

  // Function to attempt scrolling with retries
  const attemptScroll = (scrollAttempt = 1, maxScrollAttempts = 5) => {
    if (isDevelopment) {
      console.log(`[Anchor Debug] attemptScroll (Dropdown) #${hash}: Starting attempt ${scrollAttempt}/${maxScrollAttempts}.`);
    }
    // Wait for the next paint cycle after opening/potential content render
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (isDevelopment) {
          console.log(`[Anchor Debug] attemptScroll (Dropdown) #${hash}: Inside rAF, attempting find for attempt ${scrollAttempt}.`);
        }
        // Try finding the element by ID (most common case)
        let targetScrollElement = document.getElementById(hash);

        // If not found by ID, try finding an anchor tag with that ID
        if (!targetScrollElement) {
          targetScrollElement = document.querySelector(`a[id="${hash}"]`);
        }

        if (targetScrollElement) {
          // Found it! Scroll and finish.
          if (isDevelopment) {
            console.log(`[Anchor Debug] attemptScroll (Dropdown) #${hash}: Found element on attempt ${scrollAttempt}. Scrolling.`);
          }
          targetScrollElement.scrollIntoView({ block: 'start' });
        } else if (scrollAttempt < maxScrollAttempts) {
          // Not found yet, schedule a retry
          if (isDevelopment) {
            console.log(`[Anchor Debug] attemptScroll (Dropdown) #${hash}: Element not found on attempt ${scrollAttempt}. Scheduling retry in 200ms.`);
          }
          setTimeout(() => attemptScroll(scrollAttempt + 1, maxScrollAttempts), 200); // Retry after 200ms
        } else {
          // Max attempts reached, give up and restore hash for potential browser fallback
          if (isDevelopment) {
            console.log(`[Anchor Debug] attemptScroll (Dropdown) #${hash}: Element not found after ${maxScrollAttempts} attempts. Giving up and restoring hash.`);
          }
          window.location.hash = hash;
        }
      });
    });
  };

  // Start the first scroll attempt
  if (isDevelopment) {
    console.log(`[Anchor Debug] openAndScrollToDropdownAnchor: Calling attemptScroll for #${hash}.`);
  }
  attemptScroll();
}


// --- CollapseDropdown Component ---

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
  /** Optional ID for direct anchor targeting. If not provided, one is generated from summary. */
  id?: string;
}

/**
 * CollapseDropdown Component
 *
 * A styled wrapper around the native HTML <details> and <summary> elements.
 * Registers itself with the central anchor handling logic.
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
  id: providedId // Rename prop to avoid conflict with generated id
}: CollapseDropdownProps): JSX.Element {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // Effect to register/unregister this dropdown instance
  useEffect(() => {
    const element = detailsRef.current;
    if (!element || !summary) return;

    // Generate ID if not provided
    let dropdownId = providedId || '';
    if (!dropdownId && typeof summary === 'string') {
      dropdownId = summary.toLowerCase()
        .replace(/^\d+\.\d+:\s+/, '') // Remove section numbers like "6.1: "
        .replace(/\s+/g, '-')        // Replace spaces with hyphens
        .replace(/[^a-z0-9-_]/g, ''); // Remove special chars
    }

    // Only register if we have a valid ID and element
    if (dropdownId) {
      registerDropdown(dropdownId, element);

      // Cleanup function to unregister on unmount
      return () => {
        unregisterDropdown(dropdownId);
      };
    }
    // No cleanup needed if no ID was generated/provided
  }, [summary, providedId]); // Depend on summary and providedId

  return (
    <details
      ref={detailsRef}
      className={cn("my-6 group", className)}
      open={defaultOpen}
      // Assign the generated/provided ID to the details element itself
      // This allows findDropdownForHash to potentially find it via getElementById
      id={providedId || (typeof summary === 'string' ? summary.toLowerCase()
        .replace(/^\d+\.\d+:\s+/, '')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_]/g, '') : undefined)}
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
