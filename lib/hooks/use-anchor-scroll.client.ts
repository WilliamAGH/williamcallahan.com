/**
 * useAnchorScrollHandler Hook
 *
 * @module lib/hooks/use-anchor-scroll.client
 * @description Handles scrolling to anchor links (#hash) on page load and navigation,
 *              coordinating with CollapseDropdown components.
 */
'use client';

import { useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { findDropdownForHash, openAndScrollToDropdownAnchor } from '../../components/ui/collapse-dropdown.client'; // Import helpers

const isDevelopment = process.env.NODE_ENV === 'development';
const INITIAL_DELAY = 250; // Increased from 150ms to 250ms to give Firefox more time
const GENERAL_RETRY_INTERVAL = 300; // ms between general retries
const MAX_GENERAL_RETRIES = 8; // Increased from 5 to 8 for more chances to find the element
const EXPONENTIAL_BACKOFF_FACTOR = 1.5; // For increasing wait time between retries

/**
 * Checks if an element is potentially visible in the viewport context.
 * Basic check, doesn't account for overflow or complex clipping.
 * @param element The element to check.
 * @returns True if the element might be visible, false otherwise.
 */
function isElementPotentiallyVisible(element: HTMLElement): boolean {
  return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}

// Helper to get hash safely
const getCurrentHash = () => typeof window !== 'undefined' ? (window.location.hash ? window.location.hash.slice(1) : '') : '';

// Detect Firefox browser for potential browser-specific handling
const isFirefox = typeof navigator !== 'undefined' && /firefox|fxios/i.test(navigator.userAgent);

/**
 * Hook to manage scrolling to anchor links, handling cases where the
 * target might be inside a CollapseDropdown.
 */
export function useAnchorScrollHandler(): void {
  const pathname = usePathname();
  // We need a way to get the hash that updates the effect dependency correctly.
  // Reading directly in effect is okay, but let's use a state or callback if needed.
  // For now, let's try reading it inside the effect's callback.

  const handleAnchorScroll = useCallback(() => {
    const hash = getCurrentHash();
    if (!hash) {
      // No hash, nothing to do
      return;
    }

    if (isDevelopment) {
      console.log(`[Anchor Debug] handleAnchorScroll: Running handler for '#${hash}'.`);
      if (isFirefox) console.log('[Anchor Debug] Running in Firefox browser');
    }

    // --- Step 1: Immediate Check ---
    const directTargetElement = document.getElementById(hash);
    if (directTargetElement && isElementPotentiallyVisible(directTargetElement)) {
      if (isDevelopment) console.log(`[Anchor Debug] handleAnchorScroll: Found direct, visible target for '#${hash}'. Scrolling immediately.`);
      try {
        // For Firefox, add a small timeout even for "immediate" scrolling
        const scrollFunction = () => {
          directTargetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Ensure hash stays in URL after scroll
          if (history.replaceState) {
            history.replaceState(null, document.title, window.location.pathname + window.location.search + '#' + hash);
          }
        };

        if (isFirefox) {
          setTimeout(scrollFunction, 50);
        } else {
          scrollFunction();
        }
      } catch (error) {
        console.error(`[Anchor Debug] Error scrolling to direct target #${hash}:`, error);
      }
      return; // Handled directly
    } else if (directTargetElement) {
      if (isDevelopment) console.log(`[Anchor Debug] handleAnchorScroll: Found direct target for '#${hash}' but it's not visible. Assuming it might be in a dropdown.`);
    } else {
      if (isDevelopment) console.log(`[Anchor Debug] handleAnchorScroll: Direct target for '#${hash}' not found initially.`);
    }

    // --- Step 2: Dropdown Check ---
    const dropdownElement = findDropdownForHash(hash);
    if (dropdownElement) {
      if (isDevelopment) console.log(`[Anchor Debug] handleAnchorScroll: Target '#${hash}' is associated with a dropdown. Delegating.`);
      openAndScrollToDropdownAnchor(dropdownElement, hash);
      return; // Handled by dropdown logic
    } else {
      if (isDevelopment) console.log(`[Anchor Debug] handleAnchorScroll: Target '#${hash}' not associated with any known dropdown.`);
    }

    // --- Step 3: General Retry (Fallback) with Exponential Backoff ---
    let retryAttempts = 0;
    const retryScroll = () => {
      retryAttempts++;
      if (isDevelopment) console.log(`[Anchor Debug] handleAnchorScroll: General Retry #${retryAttempts}/${MAX_GENERAL_RETRIES} for '#${hash}'.`);
      const targetElement = document.getElementById(hash);
      if (targetElement && isElementPotentiallyVisible(targetElement)) {
        if (isDevelopment) console.log(`[Anchor Debug] handleAnchorScroll: Found target '#${hash}' on general retry ${retryAttempts}. Scrolling.`);
        try {
          // Add a tiny delay for Firefox to ensure the DOM is fully ready
          setTimeout(() => {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Ensure the hash stays in the URL
            if (history.replaceState) {
              history.replaceState(null, document.title, window.location.pathname + window.location.search + '#' + hash);
            }
          }, isFirefox ? 50 : 0);
        } catch (error) {
          console.error(`[Anchor Debug] Error scrolling to target #${hash} on retry:`, error);
        }
      } else if (retryAttempts < MAX_GENERAL_RETRIES) {
        // Use exponential backoff to increase wait times between retries
        const nextRetryDelay = GENERAL_RETRY_INTERVAL * Math.pow(EXPONENTIAL_BACKOFF_FACTOR, retryAttempts - 1);
        setTimeout(retryScroll, nextRetryDelay);
      } else {
        if (isDevelopment) console.log(`[Anchor Debug] handleAnchorScroll: Target '#${hash}' not found after ${MAX_GENERAL_RETRIES} general retries. Giving up.`);
      }
    };

    if (isDevelopment) console.log(`[Anchor Debug] handleAnchorScroll: Initiating general fallback retry for '#${hash}'.`);
    setTimeout(retryScroll, isFirefox ? GENERAL_RETRY_INTERVAL * 1.5 : GENERAL_RETRY_INTERVAL); // Give Firefox a bit more initial time

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]); // Depend only on pathname, hash is read inside

  useEffect(() => {
    // Use a timeout to delay the execution slightly after navigation/load
    // This allows components like Dropdowns time to mount and register.
    // Give Firefox slightly more time for initial load
    const initialDelay = isFirefox ? INITIAL_DELAY * 1.5 : INITIAL_DELAY;
    const handlerTimeout = setTimeout(handleAnchorScroll, initialDelay);

    // Cleanup function for the timeout
    return () => {
      clearTimeout(handlerTimeout);
    };
  }, [pathname, handleAnchorScroll]); // Rerun timeout setup if pathname or the handler function changes

  // Also listen for explicit hash changes on the same page
  useEffect(() => {
    const handleHashChange = () => {
      if (isDevelopment) console.log('[Anchor Debug] handleHashChange: hashchange event detected.');
      // Add a small delay here too before handling, slightly longer for Firefox
      setTimeout(handleAnchorScroll, isFirefox ? 100 : 50);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [handleAnchorScroll]); // Re-attach listener if handler changes
}
