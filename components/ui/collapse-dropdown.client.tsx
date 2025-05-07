/**
 * CollapseDropdown Component & Anchor Handling Logic Helpers
 *
 * @module components/ui/collapse-dropdown.client
 * @description Provides the CollapseDropdown component and exports helper functions
 *              for the global anchor handler to manage dropdown interactions.
 */
'use client';

import type { ReactNode } from 'react';
import { useRef, useEffect } from 'react';
import { cn } from '../../lib/utils';

// --- Centralized Dropdown Registry and Logic Helpers ---

const dropdownRegistry: { [key: string]: HTMLDetailsElement } = {};
const isDevelopment = process.env.NODE_ENV === 'development';
const enableDebugLogs = isDevelopment && false; // Set to true only when debugging dropdowns

/**
 * Registers a dropdown instance. Called by the component's effect.
 * @param id The unique ID of the dropdown.
 * @param element The HTMLDetailsElement reference.
 */
function registerDropdown(id: string, element: HTMLDetailsElement): void {
  if (enableDebugLogs) {
    console.debug(`Registering dropdown: ${id}`);
  }
  dropdownRegistry[id] = element;
}

/**
 * Unregisters a dropdown instance. Called by the component's effect cleanup.
 * @param id The unique ID of the dropdown.
 */
function unregisterDropdown(id: string): void {
  if (enableDebugLogs) {
    console.debug(`Unregistering dropdown: ${id}`);
  }
  delete dropdownRegistry[id];
}

/**
 * Attempts to find the dropdown element associated with a given hash.
 * Called by the global anchor handler hook.
 * Checks for exact ID match first, then partial match, then containment.
 * @param hash The URL hash (without '#').
 * @returns The HTMLDetailsElement or null if not found.
 */
export function findDropdownForHash(hash: string): HTMLDetailsElement | null {
  if (enableDebugLogs) {
    console.debug(`[Anchor Debug] findDropdownForHash: Searching for dropdown related to #${hash}`);
  }
  // 1. Exact ID match in registry
  if (dropdownRegistry[hash]) {
    if (enableDebugLogs) console.debug(`[Anchor Debug] findDropdownForHash: Found exact match for #${hash}`);
    return dropdownRegistry[hash];
  }
  // 2. Partial ID match
  const hashWords = hash.split('-').filter(Boolean);
  for (const [id, detailsElement] of Object.entries(dropdownRegistry)) {
    const matchCount = hashWords.filter(word => id.includes(word)).length;
    if (matchCount > 0 && matchCount >= hashWords.length * 0.5) {
      if (enableDebugLogs) console.debug(`[Anchor Debug] findDropdownForHash: Found partial match '${id}' for #${hash}`);
      return detailsElement;
    }
  }
  // 3. Check containment
  const targetElement = document.getElementById(hash);
  if (targetElement) {
    for (const [id, detailsElement] of Object.entries(dropdownRegistry)) {
      if (detailsElement.contains(targetElement)) {
        if (enableDebugLogs) console.debug(`[Anchor Debug] findDropdownForHash: Found element #${hash} inside dropdown '${id}'`);
        return detailsElement;
      }
    }
  }
  if (enableDebugLogs) console.debug(`[Anchor Debug] findDropdownForHash: No dropdown found for #${hash}`);
  return null;
}

/**
 * Opens a specific dropdown and attempts to scroll to the target hash within it, with retries.
 * Called by the global anchor handler hook.
 * @param dropdownToOpen The HTMLDetailsElement to open.
 * @param hash The target hash (without '#').
 */
export function openAndScrollToDropdownAnchor(dropdownToOpen: HTMLDetailsElement, hash: string): void {
  if (enableDebugLogs) console.debug(`[Anchor Debug] openAndScrollToDropdownAnchor: Opening dropdown for #${hash}.`);
  dropdownToOpen.open = true;

  if (history.replaceState) {
    history.replaceState(null, document.title, window.location.pathname + window.location.search);
  }

  // Use requestAnimationFrame polling to find the element after opening
  let frameId: number | null = null;
  let startTime: number | null = null;
  const maxPollingDuration = 500; // Max time to poll in ms
  // Use a type that works in both browser and Node.js environments
  let safetyTimeoutId: number | NodeJS.Timeout | null = null;

  const pollForElement = (timestamp: number) => {
    if (!startTime) {
      startTime = timestamp;
    }
    const elapsed = timestamp - startTime;

    if (enableDebugLogs) console.debug(`[Anchor Debug] pollForElement #${hash}: Polling frame. Elapsed: ${elapsed.toFixed(0)}ms`);

    const targetScrollElement = document.getElementById(hash) || document.querySelector(`a[id="${hash}"]`);

    if (targetScrollElement) {
      if (enableDebugLogs) console.debug(`[Anchor Debug] pollForElement #${hash}: Found element after ${elapsed.toFixed(0)}ms. Scrolling.`);
      targetScrollElement.scrollIntoView({ block: 'start' });
      if (frameId) window.cancelAnimationFrame(frameId); // Use window.cancelAnimationFrame
      frameId = null;
      if (safetyTimeoutId) window.clearTimeout(safetyTimeoutId); // Use window.clearTimeout
      safetyTimeoutId = null;
    } else if (elapsed < maxPollingDuration) {
      // Element not found, continue polling
      frameId = window.requestAnimationFrame(pollForElement); // Use window.requestAnimationFrame
    } else {
      // Polling timed out
      if (enableDebugLogs) console.debug(`[Anchor Debug] pollForElement #${hash}: Element not found after ${maxPollingDuration}ms. Giving up and restoring hash.`);
      window.location.hash = hash;
      if (frameId) window.cancelAnimationFrame(frameId); // Use window.cancelAnimationFrame
      frameId = null;
      if (safetyTimeoutId) window.clearTimeout(safetyTimeoutId); // Use window.clearTimeout
      safetyTimeoutId = null;
    }
  };

  // Start the polling loop
  if (enableDebugLogs) console.debug(`[Anchor Debug] openAndScrollToDropdownAnchor: Starting rAF polling for #${hash}.`);
  frameId = window.requestAnimationFrame(pollForElement); // Use window.requestAnimationFrame

  // Optional: Add a safety timeout to cancel polling if rAF somehow gets stuck (unlikely)
  safetyTimeoutId = window.setTimeout(() => { // Use window.setTimeout
      if (frameId) {
          window.cancelAnimationFrame(frameId); // Use window.cancelAnimationFrame
          if (enableDebugLogs) console.warn(`[Anchor Debug] pollForElement #${hash}: Safety timeout triggered, cancelling polling.`);
          if (!document.getElementById(hash) && !document.querySelector(`a[id="${hash}"]`)) {
              window.location.hash = hash;
          }
      }
      safetyTimeoutId = null;
  }, maxPollingDuration + 100);

  // We need a way to clear the safety timeout if polling succeeds or finishes early.
  // This is tricky as pollForElement doesn't return status.
  // For now, let's rely on the polling duration limit.
  // A more complex implementation could use a Promise or callback.

}

// --- CollapseDropdown Component ---

interface CollapseDropdownProps {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  summaryClassName?: string;
  contentClassName?: string;
  defaultOpen?: boolean;
  id?: string;
}

export function CollapseDropdown({
  summary,
  children,
  className = '',
  summaryClassName = '',
  contentClassName = '',
  defaultOpen = false,
  id: providedId
}: CollapseDropdownProps): JSX.Element {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // Effect ONLY handles registration/unregistration
  useEffect(() => {
    const element = detailsRef.current;
    if (!element || !summary) return;

    let dropdownId = providedId || '';
    if (!dropdownId && typeof summary === 'string') {
      dropdownId = summary.toLowerCase()
        .replace(/^\d+\.\d+:\s+/, '')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_]/g, '');
    }

    if (dropdownId) {
      // Register the dropdown
      registerDropdown(dropdownId, element);
      // Cleanup function to unregister on unmount
      return () => {
        unregisterDropdown(dropdownId);
      };
    }
  }, [summary, providedId]);

  // Generate the ID again for assigning to the details element
  const elementId = providedId || (typeof summary === 'string' ? summary.toLowerCase()
        .replace(/^\d+\.\d+:\s+/, '')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_]/g, '') : undefined);

  return (
    <details
      ref={detailsRef}
      className={cn("my-6 group", className)}
      open={defaultOpen}
      id={elementId} // Assign ID here
    >
      <summary
        style={{ listStyle: 'none' }}
        className={cn(
          "text-lg font-semibold cursor-pointer list-none",
          "flex items-center gap-2",
          "p-3 rounded-md border",
          "bg-slate-50 dark:bg-slate-800/50",
          "border-slate-200 dark:border-slate-700",
          "transition-colors duration-150",
          "hover:bg-slate-100 dark:hover:bg-slate-700/50",
          summaryClassName
        )}
      >
        <span className="transition-transform duration-200 group-open:rotate-90 flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-right"><path d="m9 18 6-6-6-6"/></svg>
        </span>
        <span className="flex-grow">{summary}</span>
      </summary>
      <div className={cn(
        "ml-6 mt-4 mb-4",
        "prose prose-sm dark:prose-invert max-w-none",
        "overflow-visible",
        "[&_code]:text-sm [&_code]:break-words [&_code]:whitespace-normal",
        "[&_a>code]:text-blue-600 dark:[&_a>code]:text-blue-400",
        "[&_a>code]:bg-transparent dark:[&_a>code]:bg-transparent",
        "[&_a>code]:px-0 [&_a>code]:py-0",
        "[&_a:hover>code]:text-blue-500 dark:[&_a:hover>code]:text-blue-300",
        "[&_pre]:overflow-x-auto [&_pre]:my-2",
        "[&_ul]:pl-5 [&_li]:ml-0 [&_li]:my-1",
        contentClassName
      )}>
        {children}
      </div>
    </details>
  );
}
