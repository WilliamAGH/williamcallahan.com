/**
 * Collapse Dropdown Context
 *
 * @module lib/context/collapse-dropdown-context.client
 * @description Provides a React Context for managing CollapseDropdown components
 *              within a scoped area (e.g., blog article). Replaces the module-level
 *              registry with a proper React pattern for better encapsulation and
 *              predictable rendering.
 */

"use client";

import type React from "react";
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import type { DropdownRegistryEntry, CollapseDropdownContextType } from "@/types/ui/interactive";

const CollapseDropdownContext = createContext<CollapseDropdownContextType | null>(null);

const isDevelopment = process.env.NODE_ENV === "development";
const enableDebugLogs = isDevelopment && false; // Set to true only when debugging dropdowns

export function CollapseDropdownProvider({ children }: { children: ReactNode }) {
  const dropdownRegistry = useRef<Map<string, DropdownRegistryEntry>>(new Map());
  const scrollTimerRef = useRef<number | null>(null);

  const registerDropdown = useCallback((id: string, ref: React.RefObject<HTMLDetailsElement>) => {
    if (enableDebugLogs) {
      console.debug(`[CollapseDropdownContext] Registering dropdown: ${id}`);
    }
    dropdownRegistry.current.set(id, { ref, isOpen: false });
  }, []);

  const unregisterDropdown = useCallback((id: string) => {
    if (enableDebugLogs) {
      console.debug(`[CollapseDropdownContext] Unregistering dropdown: ${id}`);
    }
    dropdownRegistry.current.delete(id);
  }, []);

  const findDropdownForHash = useCallback((hash: string): HTMLDetailsElement | null => {
    if (enableDebugLogs) {
      console.debug(`[CollapseDropdownContext] findDropdownForHash: Searching for dropdown related to #${hash}`);
    }

    // 1. Exact ID match in registry
    const exactMatch = dropdownRegistry.current.get(hash);
    if (exactMatch?.ref.current) {
      if (enableDebugLogs)
        console.debug(`[CollapseDropdownContext] findDropdownForHash: Found exact match for #${hash}`);
      return exactMatch.ref.current;
    }

    // 2. Partial ID match
    const hashWords = hash.split("-").filter(Boolean);
    for (const [id, entry] of dropdownRegistry.current.entries()) {
      const matchCount = hashWords.filter((word) => id.includes(word)).length;
      if (matchCount > 0 && matchCount >= hashWords.length * 0.5 && entry.ref.current) {
        if (enableDebugLogs)
          console.debug(`[CollapseDropdownContext] findDropdownForHash: Found partial match '${id}' for #${hash}`);
        return entry.ref.current;
      }
    }

    // 3. Check containment
    const targetElement = document.getElementById(hash);
    if (targetElement) {
      for (const [id, entry] of dropdownRegistry.current.entries()) {
        if (entry.ref.current?.contains(targetElement)) {
          if (enableDebugLogs)
            console.debug(
              `[CollapseDropdownContext] findDropdownForHash: Found element #${hash} inside dropdown '${id}'`,
            );
          return entry.ref.current;
        }
      }
    }

    if (enableDebugLogs) console.debug(`[CollapseDropdownContext] findDropdownForHash: No dropdown found for #${hash}`);
    return null;
  }, []);

  const openAndScrollToDropdownAnchor = useCallback((dropdownElement: HTMLDetailsElement, hash: string) => {
    if (enableDebugLogs)
      console.debug(`[CollapseDropdownContext] openAndScrollToDropdownAnchor: Opening dropdown for #${hash}.`);

    // Clear any existing scroll timer
    if (scrollTimerRef.current) {
      window.cancelAnimationFrame(scrollTimerRef.current);
      scrollTimerRef.current = null;
    }

    dropdownElement.open = true;

    // Remove hash from URL to prevent browser's default scroll behavior
    if (history.replaceState) {
      history.replaceState(null, document.title, window.location.pathname + window.location.search);
    }

    // Use requestAnimationFrame polling to find the element after opening
    let startTime: number | null = null;
    const maxPollingDuration = 500; // Max time to poll in ms

    const pollForElement = (timestamp: number) => {
      if (!startTime) {
        startTime = timestamp;
      }
      const elapsed = timestamp - startTime;

      if (enableDebugLogs)
        console.debug(
          `[CollapseDropdownContext] pollForElement #${hash}: Polling frame. Elapsed: ${elapsed.toFixed(0)}ms`,
        );

      const targetScrollElement = document.getElementById(hash) || document.querySelector(`a[id="${hash}"]`);

      if (targetScrollElement) {
        if (enableDebugLogs)
          console.debug(
            `[CollapseDropdownContext] pollForElement #${hash}: Found element after ${elapsed.toFixed(0)}ms. Scrolling.`,
          );
        targetScrollElement.scrollIntoView({ block: "start" });
        scrollTimerRef.current = null;
      } else if (elapsed < maxPollingDuration) {
        // Element not found, continue polling
        scrollTimerRef.current = window.requestAnimationFrame(pollForElement);
      } else {
        // Polling timed out
        if (enableDebugLogs)
          console.debug(
            `[CollapseDropdownContext] pollForElement #${hash}: Element not found after ${maxPollingDuration}ms. Giving up and restoring hash.`,
          );
        window.location.hash = hash;
        scrollTimerRef.current = null;
      }
    };

    // Start the polling loop
    if (enableDebugLogs)
      console.debug(`[CollapseDropdownContext] openAndScrollToDropdownAnchor: Starting rAF polling for #${hash}.`);
    scrollTimerRef.current = window.requestAnimationFrame(pollForElement);
  }, []);

  // Handle initial hash on mount
  useEffect(() => {
    const hash = window.location.hash.substring(1);
    if (!hash) return;

    // Give dropdowns time to register
    const timer = setTimeout(() => {
      const dropdown = findDropdownForHash(hash);
      if (dropdown) {
        openAndScrollToDropdownAnchor(dropdown, hash);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [findDropdownForHash, openAndScrollToDropdownAnchor]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scrollTimerRef.current) {
        window.cancelAnimationFrame(scrollTimerRef.current);
      }
    };
  }, []);

  const value = useMemo(
    () => ({
      registerDropdown,
      unregisterDropdown,
      findDropdownForHash,
      openAndScrollToDropdownAnchor,
    }),
    [registerDropdown, unregisterDropdown, findDropdownForHash, openAndScrollToDropdownAnchor],
  );

  return <CollapseDropdownContext.Provider value={value}>{children}</CollapseDropdownContext.Provider>;
}

export function useCollapseDropdownContext() {
  const context = useContext(CollapseDropdownContext);
  if (!context) {
    throw new Error("useCollapseDropdownContext must be used within a CollapseDropdownProvider");
  }
  return context;
}

// Export helper functions that can be used by the anchor scroll hook
export function useCollapseDropdownHelpers() {
  const context = useContext(CollapseDropdownContext);

  // Return null functions if not in context (for backward compatibility)
  if (!context) {
    return {
      findDropdownForHash: () => null,
      openAndScrollToDropdownAnchor: () => {},
    };
  }

  return {
    findDropdownForHash: context.findDropdownForHash,
    openAndScrollToDropdownAnchor: context.openAndScrollToDropdownAnchor,
  };
}
