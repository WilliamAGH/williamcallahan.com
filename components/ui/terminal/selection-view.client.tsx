/**
 * Terminal-style **Selection View** (TUI) Component
 * -------------------------------------------------
 * Renders an interactive, command-palette style list inside our faux-terminal UI.
 *
 * Key characteristics to remember (DO **NOT** conflate with standard dropdowns/menus):
 * 1. **One item per line** – implemented with `block w-full` so the look mimics CLI output.
 * 2. **Single-line truncation with ellipsis** – prevents label wrapping which would break the
 *    terminal illusion.
 * 3. **Keyboard navigation first-class** – ↑/↓ to move, Enter to select, Esc to cancel.
 * 4. **Pagination support** – shows ±24 results per "page" with explicit prev/next buttons that are
 *    part of the same list and navigable via keyboard.
 *
 * This component is ONLY intended for the search/command palette terminal UI. If you need a generic
 * list or dropdown, create a new component – do **not** reuse this one.
 */

"use client";

import { useEffect, useRef, useState, useLayoutEffect } from "react";
import type { SelectionViewProps } from "@/types/ui/terminal";

function ensureRowVisible(row: HTMLElement, container: HTMLElement) {
  // Leave a small breathing room so the highlighted row never sits flush
  const OFFSET = 6; // px
  const rowTop = row.offsetTop;
  const rowBottom = rowTop + row.offsetHeight;
  const viewTop = container.scrollTop;
  const viewBottom = viewTop + container.clientHeight;

  if (rowTop < viewTop + OFFSET) {
    container.scrollTop = Math.max(rowTop - OFFSET, 0);
  } else if (rowBottom > viewBottom - OFFSET) {
    container.scrollTop = rowBottom - container.clientHeight + OFFSET;
  }
}

export function SelectionView({ items, onSelectAction, onExitAction, scrollContainerRef }: SelectionViewProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [page, setPage] = useState(0);
  const ITEMS_PER_PAGE = 24;
  const prevItemsRef = useRef(items);

  // Ref that always points at the currently highlighted element so we can
  // ensure it stays in view when the user navigates with the keyboard. We
  // intentionally use a mutable ref to avoid unnecessary re-renders.
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  // Reset to the last page & last item when items change
  useEffect(() => {
    if (prevItemsRef.current !== items) {
      const total = Array.isArray(items) ? items.length : 0;
      const lastPage = Math.max(Math.floor((total - 1) / ITEMS_PER_PAGE), 0);
      const lastIndexOnPage = (total - 1) % ITEMS_PER_PAGE;
      setPage(lastPage);
      setSelectedIndex(lastIndexOnPage);
      prevItemsRef.current = items;
    }
  }, [items]);

  // Ensure items is an array before processing
  const validItems = Array.isArray(items) ? items : [];
  const startIdx = page * ITEMS_PER_PAGE;
  const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, validItems.length);
  const visibleItems = validItems.slice(startIdx, endIdx);
  const hasMoreResults = endIdx < validItems.length;

  // Keep the currently highlighted row within the scroll viewport. We use
  // useLayoutEffect so the scroll happens before the browser paints the
  // next frame, preventing a visible "jump".
  useLayoutEffect(() => {
    if (selectedRef.current && scrollContainerRef?.current) {
      ensureRowVisible(selectedRef.current, scrollContainerRef.current);
    }
  }, [scrollContainerRef]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowUp": {
          e.preventDefault();
          const hasPrev = page > 0;

          if (selectedIndex > visibleItems.length) {
            // On a button, move to previous button or last item
            setSelectedIndex((i) => i - 1);
          } else if (selectedIndex === visibleItems.length && hasPrev) {
            // On previous button, move to last item
            setSelectedIndex(visibleItems.length - 1);
          } else if (selectedIndex > 0) {
            // Moving within items (normal case)
            setSelectedIndex((i) => i - 1);
          } else if (hasPrev) {
            // At first item with previous page available - go to previous page
            setPage((p) => {
              const newPage = p - 1;
              const newStartIdx = newPage * ITEMS_PER_PAGE;
              const newEndIdx = Math.min(newStartIdx + ITEMS_PER_PAGE, validItems.length);
              const newVisibleCount = newEndIdx - newStartIdx;
              setSelectedIndex(newVisibleCount - 1); // Select actual last item of previous page
              return newPage;
            });
          } else {
            // Wrap to last visible item (no jumping to button)
            setSelectedIndex(visibleItems.length - 1);
          }
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          const hasPrevious = page > 0;
          const totalButtons = visibleItems.length + (hasPrevious ? 1 : 0) + (hasMoreResults ? 1 : 0);

          if (selectedIndex < visibleItems.length - 1) {
            // Moving within visible items
            setSelectedIndex((i) => i + 1);
          } else if (selectedIndex === visibleItems.length - 1) {
            // At last item, move to first button
            if (hasPrevious) {
              setSelectedIndex(visibleItems.length); // Previous button
            } else if (hasMoreResults) {
              setSelectedIndex(visibleItems.length); // Next button
            } else {
              setSelectedIndex(0); // Wrap to top
            }
          } else if (selectedIndex < totalButtons - 1) {
            // Moving between buttons
            setSelectedIndex((i) => i + 1);
          } else {
            // At last button, wrap to top
            setSelectedIndex(0);
          }
          break;
        }
        case "Enter": {
          e.preventDefault();
          const isPrevButton = page > 0 && selectedIndex === visibleItems.length;
          const isNextButton = hasMoreResults && selectedIndex === visibleItems.length + (page > 0 ? 1 : 0);

          if (isPrevButton) {
            // Show previous page
            setPage((p) => p - 1);
            setSelectedIndex(0);
          } else if (isNextButton) {
            // Show next page
            setPage((p) => p + 1);
            setSelectedIndex(0);
          } else if (selectedIndex < visibleItems.length && visibleItems[selectedIndex]) {
            onSelectAction(visibleItems[selectedIndex]);
          }
          break;
        }
        case "Escape":
          e.preventDefault();
          onExitAction();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visibleItems, selectedIndex, onSelectAction, onExitAction, hasMoreResults, page, validItems.length]);

  return (
    <div className="mt-1" data-testid="selection-view">
      <div className="text-gray-400 text-xs mb-1">
        Use ↑↓ to navigate, Enter to select, Esc to cancel
        {validItems.length > ITEMS_PER_PAGE && (
          <>
            {" • "}Page {page + 1} of {Math.ceil(validItems.length / ITEMS_PER_PAGE)}
            {" • "}Showing {startIdx + 1}-{endIdx} of {validItems.length}
          </>
        )}
      </div>
      {visibleItems.map((item, index) => (
        <button
          key={item.id} // stable key
          ref={index === selectedIndex ? selectedRef : undefined}
          type="button"
          /*
           * Styling rules:
           * 1. `block w-full text-left` → each result is forced onto its own line occupying full width.
           * 2. `truncate whitespace-nowrap overflow-hidden` → long labels are clipped with an ellipsis
           *    instead of wrapping to a second line, keeping the list compact and readable.
           */
          className={`block w-full text-left px-2 py-1 rounded cursor-pointer truncate whitespace-nowrap overflow-hidden ${
            index === selectedIndex ? "bg-blue-500/20 text-blue-300" : "hover:bg-gray-800"
          }`}
          onClick={() => onSelectAction(item)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          {item.label}
        </button>
      ))}
      <div className="flex justify-between mt-2">
        {page > 0 ? (
          <button
            type="button"
            ref={selectedIndex === visibleItems.length ? selectedRef : undefined}
            className={`px-2 py-1 rounded cursor-pointer ${
              selectedIndex === visibleItems.length ? "bg-blue-500/20 text-blue-300" : "hover:bg-gray-800"
            }`}
            onClick={() => {
              setPage((p) => p - 1);
              setSelectedIndex(0);
            }}
            onMouseEnter={() => setSelectedIndex(visibleItems.length)}
            aria-label={`Show previous ${ITEMS_PER_PAGE} results`}
          >
            ← Show previous {ITEMS_PER_PAGE} results
          </button>
        ) : (
          <div /> // Spacer for alignment
        )}
        {hasMoreResults && (
          <button
            type="button"
            ref={selectedIndex === visibleItems.length + (page > 0 ? 1 : 0) ? selectedRef : undefined}
            className={`px-2 py-1 rounded cursor-pointer ${
              selectedIndex === visibleItems.length + (page > 0 ? 1 : 0)
                ? "bg-blue-500/20 text-blue-300"
                : "hover:bg-gray-800"
            }`}
            onClick={() => {
              setPage((p) => p + 1);
              setSelectedIndex(0);
            }}
            onMouseEnter={() => setSelectedIndex(visibleItems.length + (page > 0 ? 1 : 0))}
            aria-label={`Show next ${Math.min(ITEMS_PER_PAGE, validItems.length - endIdx)} results`}
          >
            → Show next {Math.min(ITEMS_PER_PAGE, validItems.length - endIdx)} results
          </button>
        )}
      </div>
    </div>
  );
}
