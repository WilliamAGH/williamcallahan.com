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
  // Buffer zone: keep 3 items visible above/below the current item for smooth scrolling
  const BUFFER_ITEMS = 3;
  const EDGE_OFFSET = 6; // px - small offset from container edges

  // Get the row's parent (the actual list item container)
  const rowContainer = row.parentElement;
  if (!rowContainer) return;

  // Calculate item height from the row container
  const itemHeight = rowContainer.offsetHeight;
  const bufferPixels = BUFFER_ITEMS * itemHeight;

  // Use getBoundingClientRect for accurate positioning
  const rect = rowContainer.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  // Calculate relative positions
  const relativeTop = rect.top - containerRect.top;
  const relativeBottom = rect.bottom - containerRect.top;

  // Define the "safe zone" where no scrolling is needed
  const safeZoneTop = bufferPixels;
  const safeZoneBottom = containerRect.height - bufferPixels;

  // Scroll to maintain buffer zone
  if (relativeTop < safeZoneTop) {
    // Item is too close to top - scroll up to restore buffer
    const scrollAmount = relativeTop - safeZoneTop - EDGE_OFFSET;
    container.scrollTop = Math.max(0, container.scrollTop + scrollAmount);
  } else if (relativeBottom > safeZoneBottom) {
    // Item is too close to bottom - scroll down to restore buffer
    const scrollAmount = relativeBottom - safeZoneBottom + EDGE_OFFSET;
    container.scrollTop += scrollAmount;
  }
  // If item is within the safe zone, don't scroll at all
}

export function SelectionView({ items, onSelectAction, onExitAction, scrollContainerRef }: SelectionViewProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [page, setPage] = useState(0);
  const ITEMS_PER_PAGE = 24;
  const prevItemsRef = useRef(items);

  // Track whether user is using keyboard navigation
  // When true, mouse hover won't change selection
  const [isKeyboardMode, setIsKeyboardMode] = useState(false);

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
  // DO NOT REMOVE THIS CODE!
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedIndex MUST be in deps for scroll-to-view to work
  useLayoutEffect(() => {
    if (selectedRef.current && scrollContainerRef?.current) {
      ensureRowVisible(selectedRef.current, scrollContainerRef.current);
    }
  }, [scrollContainerRef, selectedIndex]);

  // --- Keyboard navigation (element-scoped) ---
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Only prevent default for keys we're handling
    if (["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(e.key)) {
      e.preventDefault();

      // Enter keyboard mode when arrow keys are used
      if (["ArrowUp", "ArrowDown"].includes(e.key)) {
        setIsKeyboardMode(true);
      }
    }
    switch (e.key) {
      case "ArrowUp": {
        const hasPrev = page > 0;

        // Skip pagination buttons - only navigate through actual items
        if (selectedIndex > 0) {
          setSelectedIndex((i) => i - 1);
        } else if (hasPrev) {
          // Seamlessly load previous page and position cursor at last item
          setPage((p) => p - 1);
          // Calculate the last item index on the previous page
          const prevPageStartIdx = (page - 1) * ITEMS_PER_PAGE;
          const prevPageEndIdx = Math.min(prevPageStartIdx + ITEMS_PER_PAGE, validItems.length);
          const lastItemIndex = prevPageEndIdx - prevPageStartIdx - 1;
          setSelectedIndex(lastItemIndex);
        } else {
          // At the very first item - stay there
          setSelectedIndex(0);
        }
        break;
      }
      case "ArrowDown": {
        // Skip pagination buttons - only navigate through actual items
        if (selectedIndex < visibleItems.length - 1) {
          setSelectedIndex((i) => i + 1);
        } else if (hasMoreResults) {
          // Seamlessly load next page and position cursor at first item
          setPage((p) => p + 1);
          setSelectedIndex(0);
        } else {
          // At the very last item - stay there
          setSelectedIndex(visibleItems.length - 1);
        }
        break;
      }
      case "Enter": {
        // Only handle actual item selection, not pagination
        if (selectedIndex < visibleItems.length && visibleItems[selectedIndex]) {
          onSelectAction(visibleItems[selectedIndex]);
        }
        break;
      }
      case "Escape": {
        onExitAction();
        break;
      }
    }
  };

  // Auto-focus the listbox on mount so keyboard navigation works immediately
  const listboxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listboxRef.current?.focus();
  }, []);

  // No longer exit keyboard mode on mouse move - too aggressive

  // Handle mouse entering an item
  const handleItemMouseEnter = (index: number) => {
    // In keyboard mode, don't change selection on hover
    if (isKeyboardMode) {
      return;
    }
    // In mouse mode, update selection
    setSelectedIndex(index);
  };

  // Handle mouse click on an item - this should exit keyboard mode
  const handleItemClick = (item: { id: string; label: string; description: string; path: string }) => {
    if (isKeyboardMode) {
      setIsKeyboardMode(false);
    }
    onSelectAction(item);
  };

  return (
    <div
      className="mt-1 outline-none"
      data-testid="selection-view"
      onKeyDown={handleKeyDown}
      ref={listboxRef}
      role="listbox"
      aria-label="Search results"
      aria-activedescendant={
        selectedIndex >= 0 && visibleItems[selectedIndex] ? `option-${visibleItems[selectedIndex].id}` : undefined
      }
      tabIndex={0}
    >
      <div className="text-gray-400 text-xs mb-1">
        Use ↑↓ to navigate, Enter to select, Esc to cancel
        {isKeyboardMode && <span className="ml-2 text-blue-400">[Keyboard Mode]</span>}
        {validItems.length > ITEMS_PER_PAGE && (
          <>
            {" • "}Page {page + 1} of {Math.ceil(validItems.length / ITEMS_PER_PAGE)}
            {" • "}Showing {startIdx + 1}-{endIdx} of {validItems.length}
          </>
        )}
      </div>
      <div className="group" data-keyboard-mode={isKeyboardMode}>
        {visibleItems.map((item, index) => (
          <div key={item.id}>
            <button
              id={`option-${item.id}`}
              ref={index === selectedIndex ? selectedRef : undefined}
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              /*
               * Styling rules:
               * 1. `block w-full text-left` → each result is forced onto its own line occupying full width.
               * 2. `truncate whitespace-nowrap overflow-hidden` → long labels are clipped with an ellipsis
               *    instead of wrapping to a second line, keeping the list compact and readable.
               * 3. `aria-selected:*` → styles apply when this item is keyboard-selected
               * 4. `group-data-[keyboard-mode=false]:*` → hover only applies when NOT in keyboard mode
               */
              className="
                block w-full text-left px-2 py-1 rounded cursor-pointer truncate whitespace-nowrap overflow-hidden
                aria-selected:bg-blue-500/20 aria-selected:text-blue-300
                group-data-[keyboard-mode=false]:aria-[selected=false]:hover:bg-gray-800
              "
              onClick={() => handleItemClick(item)}
              onMouseEnter={() => handleItemMouseEnter(index)}
            >
              {item.label}
            </button>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 text-gray-500 text-xs">
        {page > 0 ? (
          <button
            type="button"
            className="px-2 py-1 rounded cursor-pointer hover:bg-gray-800 hover:text-gray-400"
            onClick={() => {
              setPage((p) => p - 1);
              // Keep cursor at last item of previous page
              const prevPageStartIdx = (page - 1) * ITEMS_PER_PAGE;
              const prevPageEndIdx = Math.min(prevPageStartIdx + ITEMS_PER_PAGE, validItems.length);
              setSelectedIndex(prevPageEndIdx - prevPageStartIdx - 1);
            }}
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
            className="px-2 py-1 rounded cursor-pointer hover:bg-gray-800 hover:text-gray-400"
            onClick={() => {
              setPage((p) => p + 1);
              setSelectedIndex(0);
            }}
            aria-label={`Show next ${Math.min(ITEMS_PER_PAGE, validItems.length - endIdx)} results`}
          >
            → Show next {Math.min(ITEMS_PER_PAGE, validItems.length - endIdx)} results
          </button>
        )}
      </div>
    </div>
  );
}
