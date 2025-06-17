/**
 * useAnchorScrollHandler Hook
 *
 * @module lib/hooks/use-anchor-scroll.client
 * @description Handles scrolling to anchor links (#hash) on page load and navigation,
 *              coordinating with CollapseDropdown components.
 */
"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { useCollapseDropdownHelpers } from "../context/collapse-dropdown-context.client";

const isDevelopment = process.env.NODE_ENV === "development";
const INITIAL_DELAY = 250;
const GENERAL_RETRY_INTERVAL = 300;
const MAX_GENERAL_RETRIES = 8;
const EXPONENTIAL_BACKOFF_FACTOR = 1.5;

function isElementPotentiallyVisible(element: HTMLElement): boolean {
  return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}

const getCurrentHash = () =>
  typeof window !== "undefined" ? (window.location.hash ? window.location.hash.slice(1) : "") : "";

const isFirefox = typeof navigator !== "undefined" && /firefox|fxios/i.test(navigator.userAgent);

export function useAnchorScrollHandler(): void {
  const pathname = usePathname();
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { findDropdownForHash, openAndScrollToDropdownAnchor } = useCollapseDropdownHelpers();

  const handleAnchorScroll = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    const hash = getCurrentHash();
    if (!hash) {
      return;
    }

    if (isDevelopment) {
      console.log(`[Anchor Debug] handleAnchorScroll: Running handler for '#${hash}'.`);
      if (isFirefox) console.log("[Anchor Debug] Running in Firefox browser");
    }

    const directTargetElement = document.getElementById(hash);
    if (directTargetElement && isElementPotentiallyVisible(directTargetElement)) {
      if (isDevelopment) {
        console.log(
          `[Anchor Debug] handleAnchorScroll: Found direct, visible target for '#${hash}'. Scrolling immediately.`,
        );
      }
      try {
        const scrollFunction = () => {
          directTargetElement.scrollIntoView({ behavior: "smooth", block: "start" });
          if (history.replaceState) {
            history.replaceState(
              null,
              document.title,
              `${pathname + window.location.search}#${hash}`,
            );
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
      return;
    }

    if (directTargetElement) {
      if (isDevelopment) {
        console.log(
          `[Anchor Debug] handleAnchorScroll: Found direct target for '#${hash}' but it's not visible. Assuming it might be in a dropdown.`,
        );
      }
    } else if (isDevelopment) {
      console.log(
        `[Anchor Debug] handleAnchorScroll: Direct target for '#${hash}' not found initially.`,
      );
    }

    const dropdownElement = findDropdownForHash(hash);
    if (dropdownElement) {
      if (isDevelopment) {
        console.log(
          `[Anchor Debug] handleAnchorScroll: Target '#${hash}' is associated with a dropdown. Delegating.`,
        );
      }
      openAndScrollToDropdownAnchor(dropdownElement, hash);
      return;
    }
    if (isDevelopment) {
      console.log(
        `[Anchor Debug] handleAnchorScroll: Target '#${hash}' not associated with any known dropdown.`,
      );
    }

    let retryAttempts = 0;
    const retryScroll = () => {
      retryAttempts++;
      if (isDevelopment) {
        console.log(
          `[Anchor Debug] handleAnchorScroll: General Retry #${retryAttempts}/${MAX_GENERAL_RETRIES} for '#${hash}'.`,
        );
      }
      const targetElement = document.getElementById(hash);
      if (targetElement && isElementPotentiallyVisible(targetElement)) {
        if (isDevelopment) {
          console.log(
            `[Anchor Debug] handleAnchorScroll: Found target '#${hash}' on general retry ${retryAttempts}. Scrolling.`,
          );
        }
        try {
          setTimeout(
            () => {
              targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
              if (history.replaceState) {
                history.replaceState(
                  null,
                  document.title,
                  `${pathname + window.location.search}#${hash}`,
                );
              }
            },
            isFirefox ? 50 : 0,
          );
        } catch (error) {
          console.error(`[Anchor Debug] Error scrolling to target #${hash} on retry:`, error);
        }
      } else if (retryAttempts < MAX_GENERAL_RETRIES) {
        const nextRetryDelay =
          GENERAL_RETRY_INTERVAL * EXPONENTIAL_BACKOFF_FACTOR ** (retryAttempts - 1);
        retryTimerRef.current = setTimeout(retryScroll, nextRetryDelay);
      } else if (isDevelopment) {
        console.log(
          `[Anchor Debug] handleAnchorScroll: Target '#${hash}' not found after ${MAX_GENERAL_RETRIES} general retries. Giving up.`,
        );
      }
    };

    if (isDevelopment) {
      console.log(
        `[Anchor Debug] handleAnchorScroll: Initiating general fallback retry for '#${hash}'.`,
      );
    }
    retryTimerRef.current = setTimeout(
      retryScroll,
      isFirefox ? GENERAL_RETRY_INTERVAL * 1.5 : GENERAL_RETRY_INTERVAL,
    );
  }, [findDropdownForHash, openAndScrollToDropdownAnchor, pathname]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const initialDelay = isFirefox ? INITIAL_DELAY * 1.5 : INITIAL_DELAY;
    const handlerTimeout = setTimeout(handleAnchorScroll, initialDelay);

    return () => {
      clearTimeout(handlerTimeout);
    };
  }, [handleAnchorScroll]);

  useEffect(() => {
    const handleHashChange = () => {
      if (isDevelopment) console.log("[Anchor Debug] handleHashChange: hashchange event detected.");
      setTimeout(handleAnchorScroll, isFirefox ? 100 : 50);
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, [handleAnchorScroll]);
}
