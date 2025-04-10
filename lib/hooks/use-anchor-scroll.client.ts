/**
 * useAnchorScrollHandler Hook
 *
 * @module lib/hooks/use-anchor-scroll.client
 * @description Handles scrolling to anchor links (#hash) on page load and navigation,
 *              coordinating with CollapseDropdown components.
 */
'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { findDropdownForHash, openAndScrollToDropdownAnchor } from '../../components/ui/collapse-dropdown.client'; // Import helpers

const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Checks if an element is potentially visible in the viewport context.
 * Basic check, doesn't account for overflow or complex clipping.
 * @param element The element to check.
 * @returns True if the element might be visible, false otherwise.
 */
function isElementPotentiallyVisible(element: HTMLElement): boolean {
  return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}

/**
 * Hook to manage scrolling to anchor links, handling cases where the
 * target might be inside a CollapseDropdown.
 */
export function useAnchorScrollHandler(): void {
  const pathname = usePathname();

  useEffect(() => {
    const hash = window.location.hash ? window.location.hash.slice(1) : '';
    if (!hash) {
      // No hash, nothing to do
      return;
    }

    if (isDevelopment) {
      console.log(`[Anchor Debug] useAnchorScrollHandler: Detected hash '#${hash}' on path '${pathname}'.`);
    }

    // Debounce or delay slightly to allow components (like dropdowns) to register
    const handlerTimeout = setTimeout(() => {
      if (isDevelopment) {
        console.log(`[Anchor Debug] useAnchorScrollHandler: Running handler for '#${hash}'.`);
      }

      // --- Step 1: Immediate Check ---
      const directTargetElement = document.getElementById(hash);
      if (directTargetElement && isElementPotentiallyVisible(directTargetElement)) {
        // Element exists and is likely visible (not in a closed dropdown)
        if (isDevelopment) {
          console.log(`[Anchor Debug] useAnchorScrollHandler: Found direct, visible target for '#${hash}'. Scrolling immediately.`);
        }
        // Prevent our own logic from interfering further if browser handles it
         try {
           // Use try-catch as scrollIntoView might fail in some edge cases
           directTargetElement.scrollIntoView({ block: 'start' });
           // Optionally replace state to clean URL if browser didn't already scroll
           // if (history.replaceState) {
           //   history.replaceState(null, document.title, pathname + window.location.search);
           // }
         } catch (error) {
            console.error(`[Anchor Debug] Error scrolling to direct target #${hash}:`, error);
         }
        return; // Handled directly
      } else if (directTargetElement) {
         if (isDevelopment) {
            console.log(`[Anchor Debug] useAnchorScrollHandler: Found direct target for '#${hash}' but it's not visible. Assuming it might be in a dropdown.`);
         }
      } else {
         if (isDevelopment) {
            console.log(`[Anchor Debug] useAnchorScrollHandler: Direct target for '#${hash}' not found initially.`);
         }
      }


      // --- Step 2: Dropdown Check ---
      const dropdownElement = findDropdownForHash(hash);
      if (dropdownElement) {
        if (isDevelopment) {
          console.log(`[Anchor Debug] useAnchorScrollHandler: Target '#${hash}' is associated with a dropdown. Delegating.`);
        }
        openAndScrollToDropdownAnchor(dropdownElement, hash);
        return; // Handled by dropdown logic
      } else {
         if (isDevelopment) {
            console.log(`[Anchor Debug] useAnchorScrollHandler: Target '#${hash}' not associated with any known dropdown.`);
         }
      }

      // --- Step 3: General Retry (Fallback) ---
      // If not found directly and not in a dropdown, try a few times more,
      // as the element might appear due to other async operations.
      let retryAttempts = 0;
      const maxRetries = 5;
      const retryInterval = 300; // ms

      const retryScroll = () => {
        retryAttempts++;
        if (isDevelopment) {
            console.log(`[Anchor Debug] useAnchorScrollHandler: General Retry #${retryAttempts}/${maxRetries} for '#${hash}'.`);
        }
        const targetElement = document.getElementById(hash);
        if (targetElement && isElementPotentiallyVisible(targetElement)) {
          if (isDevelopment) {
            console.log(`[Anchor Debug] useAnchorScrollHandler: Found target '#${hash}' on general retry ${retryAttempts}. Scrolling.`);
          }
           try {
              targetElement.scrollIntoView({ block: 'start' });
              // Clean up hash only if we successfully scrolled
              if (history.replaceState) {
                 history.replaceState(null, document.title, pathname + window.location.search);
              }
           } catch (error) {
              console.error(`[Anchor Debug] Error scrolling to target #${hash} on retry:`, error);
           }
        } else if (retryAttempts < maxRetries) {
          setTimeout(retryScroll, retryInterval);
        } else {
           if (isDevelopment) {
              console.log(`[Anchor Debug] useAnchorScrollHandler: Target '#${hash}' not found after ${maxRetries} general retries. Giving up.`);
           }
           // Optional: Restore hash if we gave up? Might cause jump if browser finds it later.
           // window.location.hash = hash;
        }
      };

      if (isDevelopment) {
        console.log(`[Anchor Debug] useAnchorScrollHandler: Initiating general fallback retry for '#${hash}'.`);
      }
      setTimeout(retryScroll, retryInterval); // Start the first retry after a delay

    }, 100); // Initial delay for the main handler logic

    // Cleanup function for the main timeout
    return () => {
      clearTimeout(handlerTimeout);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps -- Need to recalculate hash on every render potentially
  }, [pathname, getCurrentHash()]); // Depend on pathname and the calculated hash value
}

// Helper to get hash safely
const getCurrentHash = () => typeof window !== 'undefined' ? window.location.hash : '';
