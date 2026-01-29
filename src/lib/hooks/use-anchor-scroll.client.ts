/**
 * useAnchorScrollHandler Hook
 *
 * @module lib/hooks/use-anchor-scroll.client
 * @description Handles scrolling to anchor links (#hash) that are inside CollapseDropdown
 *              components. For regular anchors, Next.js 16's built-in hash scroll handling
 *              is used (see layout-router.js InnerScrollAndFocusHandler).
 *
 * @remarks
 * This hook only handles anchors that:
 * 1. Are inside a CollapseDropdown (need to open dropdown first)
 * 2. Are not initially visible (may be in a closed dropdown)
 *
 * Regular visible anchor targets are handled by Next.js's native scroll behavior.
 */
"use client";

import { useCallback, useEffect, useRef } from "react";
import { useCollapseDropdownHelpers } from "../context/collapse-dropdown-context.client";

const isDevelopment = process.env.NODE_ENV === "development";
const INITIAL_DELAY = 100; // Short delay to let Next.js handle visible anchors first
const DROPDOWN_RETRY_INTERVAL = 200;
const MAX_DROPDOWN_RETRIES = 5;

function isElementPotentiallyVisible(element: HTMLElement): boolean {
  return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}

const getCurrentHash = () =>
  typeof window !== "undefined" ? (window.location.hash ? window.location.hash.slice(1) : "") : "";

export function useAnchorScrollHandler(): void {
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { findDropdownForHash, openAndScrollToDropdownAnchor } = useCollapseDropdownHelpers();

  const handleAnchorScroll = useCallback(() => {
    // Cleanup any existing timeouts
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    const hash = getCurrentHash();
    if (!hash) {
      return;
    }

    if (isDevelopment) {
      console.log(
        `[Anchor Debug] handleAnchorScroll: Checking if '#${hash}' needs dropdown handling.`,
      );
    }

    // Check if the element is already visible - if so, Next.js has handled it
    const directTargetElement = document.getElementById(hash);
    if (directTargetElement && isElementPotentiallyVisible(directTargetElement)) {
      if (isDevelopment) {
        console.log(
          `[Anchor Debug] handleAnchorScroll: Target '#${hash}' is already visible. Next.js handled scroll.`,
        );
      }
      // Next.js already scrolled to this element - do nothing
      return;
    }

    // Element not found or not visible - check if it's in a dropdown
    const dropdownElement = findDropdownForHash(hash);
    if (dropdownElement) {
      if (isDevelopment) {
        console.log(
          `[Anchor Debug] handleAnchorScroll: Target '#${hash}' is in a dropdown. Opening and scrolling.`,
        );
      }
      openAndScrollToDropdownAnchor(dropdownElement, hash);
      return;
    }

    // Element not found and not in a dropdown - retry a few times
    // (element might be in a dropdown that hasn't registered yet)
    if (isDevelopment) {
      console.log(
        `[Anchor Debug] handleAnchorScroll: Target '#${hash}' not found. Starting retry for dropdown check.`,
      );
    }

    let retryAttempts = 0;
    const retryDropdownCheck = () => {
      retryAttempts++;
      if (isDevelopment) {
        console.log(
          `[Anchor Debug] handleAnchorScroll: Dropdown retry #${retryAttempts}/${MAX_DROPDOWN_RETRIES} for '#${hash}'.`,
        );
      }

      // Check if element is now visible (maybe rendered by React)
      const targetElement = document.getElementById(hash);
      if (targetElement && isElementPotentiallyVisible(targetElement)) {
        if (isDevelopment) {
          console.log(
            `[Anchor Debug] handleAnchorScroll: Target '#${hash}' is now visible. Next.js should handle it.`,
          );
        }
        // Element is now visible - Next.js's scroll restoration should handle it
        // or the element was rendered after initial load
        return;
      }

      // Check for dropdown again
      const dropdown = findDropdownForHash(hash);
      if (dropdown) {
        if (isDevelopment) {
          console.log(
            `[Anchor Debug] handleAnchorScroll: Found dropdown for '#${hash}' on retry ${retryAttempts}. Opening.`,
          );
        }
        openAndScrollToDropdownAnchor(dropdown, hash);
        return;
      }

      // Continue retrying if not at max
      if (retryAttempts < MAX_DROPDOWN_RETRIES) {
        retryTimerRef.current = setTimeout(retryDropdownCheck, DROPDOWN_RETRY_INTERVAL);
      } else if (isDevelopment) {
        console.log(
          `[Anchor Debug] handleAnchorScroll: Target '#${hash}' not found after ${MAX_DROPDOWN_RETRIES} retries. Giving up.`,
        );
      }
    };

    retryTimerRef.current = setTimeout(retryDropdownCheck, DROPDOWN_RETRY_INTERVAL);
  }, [findDropdownForHash, openAndScrollToDropdownAnchor]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  // Initial anchor handling after short delay
  useEffect(() => {
    const handlerTimeout = setTimeout(handleAnchorScroll, INITIAL_DELAY);
    return () => {
      clearTimeout(handlerTimeout);
    };
  }, [handleAnchorScroll]);

  // Listen for hash changes (e.g., clicking anchor links)
  useEffect(() => {
    const handleHashChange = () => {
      if (isDevelopment) console.log("[Anchor Debug] handleHashChange: hashchange event detected.");
      // Short delay to let Next.js handle visible anchors first
      setTimeout(handleAnchorScroll, INITIAL_DELAY);
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, [handleAnchorScroll]);
}
