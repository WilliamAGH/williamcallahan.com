/**
 * Selection View Component
 *
 * Displays a list of selectable items with keyboard navigation
 */

"use client";

import { useEffect, useRef, useState } from "react";
import type { SelectionViewProps } from "@/types/ui/terminal";

export function SelectionView({ items, onSelectAction, onExitAction }: SelectionViewProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [page, setPage] = useState(0);
  const ITEMS_PER_PAGE = 24;
  const prevItemsRef = useRef(items);

  // Reset page when items change
  useEffect(() => {
    if (prevItemsRef.current !== items) {
      setPage(0);
      setSelectedIndex(0);
      prevItemsRef.current = items;
    }
  }, [items]);

  // Ensure items is an array before processing
  const validItems = Array.isArray(items) ? items : [];
  const startIdx = page * ITEMS_PER_PAGE;
  const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, validItems.length);
  const visibleItems = validItems.slice(startIdx, endIdx);
  const hasMoreResults = endIdx < validItems.length;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowUp": {
          e.preventDefault();
          const hasPrev = page > 0;
          const totalBtns = visibleItems.length + (hasPrev ? 1 : 0) + (hasMoreResults ? 1 : 0);

          if (selectedIndex > visibleItems.length) {
            // On a button, move to previous button or last item
            setSelectedIndex((i) => i - 1);
          } else if (selectedIndex === visibleItems.length && hasPrev) {
            // On previous button, move to last item
            setSelectedIndex(visibleItems.length - 1);
          } else if (selectedIndex > 0 && selectedIndex <= visibleItems.length) {
            // Moving within items
            setSelectedIndex((i) => i - 1);
          } else {
            // At first item, wrap to last button
            setSelectedIndex(totalBtns - 1);
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
  }, [visibleItems, selectedIndex, onSelectAction, onExitAction, hasMoreResults, page]);

  return (
    <div className="mt-1">
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
          key={item.id} // Use item.id for a stable key
          type="button"
          className={`px-2 py-1 rounded cursor-pointer ${
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
