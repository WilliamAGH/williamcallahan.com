/**
 * @fileoverview FocusTrap Component
 * @description Traps focus within a component when active, ensuring keyboard navigation stays within the component's bounds. Also handles escape key for dismissal.
 * @author William Callahan
 * @version 1.0.0
 * @since 2025-06-12
 */

"use client";

import { useCallback, useEffect, useRef } from "react";
import type { FocusTrapExtendedProps as FocusTrapProps } from "@/types/ui";

/**
 * FocusTrap Component
 *
 * Traps focus within a component when active, ensuring keyboard navigation
 * stays within the component's bounds. Also handles escape key for dismissal.
 */
export function FocusTrap({ children, active, initialFocus = true, onEscape }: FocusTrapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Store the element that had focus before trap was activated
  const previousFocus = useRef<HTMLElement | null>(null);

  const handleFocus = useCallback(
    (e: FocusEvent) => {
      if (!active || !containerRef.current) return;

      const targetNode = e.target;
      if (targetNode instanceof Node && !containerRef.current.contains(targetNode)) {
        // Focus left the container, bring it back
        startRef.current?.focus();
      }
    },
    [active],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!active) return;

      if (e.key === "Escape" && onEscape) {
        e.preventDefault();
        onEscape();
        return;
      }

      if (e.key === "Tab") {
        if (!e.shiftKey && document.activeElement === endRef.current) {
          e.preventDefault();
          startRef.current?.focus();
        } else if (e.shiftKey && document.activeElement === startRef.current) {
          e.preventDefault();
          endRef.current?.focus();
        }
      }
    },
    [active, onEscape],
  );

  // Set up focus trap
  useEffect(() => {
    if (active) {
      // Store current focus
      const currentActiveElement = document.activeElement;
      if (currentActiveElement instanceof HTMLElement) {
        previousFocus.current = currentActiveElement;
      } else {
        previousFocus.current = null;
      }

      // Set initial focus if enabled
      if (initialFocus && containerRef.current) {
        // Find first focusable element
        const focusable = containerRef.current.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable) {
          focusable.focus();
        } else {
          startRef.current?.focus();
        }
      }

      // Add event listeners
      document.addEventListener("focus", handleFocus, true);
      document.addEventListener("keydown", handleKeyDown);

      // Prevent scroll on body
      document.body.style.overflow = "hidden";

      return () => {
        // Cleanup
        document.removeEventListener("focus", handleFocus, true);
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "";

        // Restore focus
        if (previousFocus.current && document.contains(previousFocus.current)) {
          previousFocus.current.focus();
        }
      };
    }
  }, [active, initialFocus, handleFocus, handleKeyDown]);

  // Handle component unmount
  useEffect(() => {
    return () => {
      if (previousFocus.current && document.contains(previousFocus.current)) {
        previousFocus.current.focus();
      }
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div ref={containerRef}>
      {/* Start focus sentinel */}
      <div
        ref={startRef}
        tabIndex={active ? 0 : -1}
        data-inert={!active}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: 0,
          height: 0,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      />

      {children}

      {/* End focus sentinel */}
      <div
        ref={endRef}
        tabIndex={active ? 0 : -1}
        data-inert={!active}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: 0,
          height: 0,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      />
    </div>
  );
}
