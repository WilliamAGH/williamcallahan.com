/**
 * Selection View Component
 *
 * Displays a list of selectable items with keyboard navigation
 */

"use client";

import { useEffect, useState } from "react";
import type { SelectionViewProps } from "@/types/ui/terminal";

export function SelectionView({ items, onSelectAction, onExitAction }: SelectionViewProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [page, setPage] = useState(0);
  const ITEMS_PER_PAGE = 24;

  // Ensure items is an array before processing
  const validItems = Array.isArray(items) ? items : [];
  const startIdx = page * ITEMS_PER_PAGE;
  const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, validItems.length);
  const visibleItems = validItems.slice(startIdx, endIdx);
  const hasMoreResults = endIdx < validItems.length;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => (i > 0 ? i - 1 : visibleItems.length - 1));
          break;
        case "ArrowDown":
          e.preventDefault();
          // Special handling for last item when there are more results
          if (selectedIndex === visibleItems.length - 1 && hasMoreResults) {
            setSelectedIndex(visibleItems.length); // Select "Show next" option
          } else if (selectedIndex === visibleItems.length && hasMoreResults) {
            setSelectedIndex(0); // Wrap to top
          } else {
            setSelectedIndex((i) => (i < visibleItems.length - 1 ? i + 1 : 0));
          }
          break;
        case "Enter":
          e.preventDefault();
          if (selectedIndex === visibleItems.length && hasMoreResults) {
            // Show next page
            setPage((p) => p + 1);
            setSelectedIndex(0);
          } else if (visibleItems[selectedIndex]) {
            onSelectAction(visibleItems[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onExitAction();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visibleItems, selectedIndex, onSelectAction, onExitAction, hasMoreResults]);

  return (
    <div className="mt-1">
      <div className="text-gray-400 text-xs mb-1">
        Use ↑↓ to navigate, Enter to select, Esc to cancel
        {validItems.length > ITEMS_PER_PAGE && ` • Showing ${startIdx + 1}-${endIdx} of ${validItems.length}`}
      </div>
      {visibleItems.map((item, index) => (
        <button
          key={item.path} // Use item.path for a more stable key
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
      {hasMoreResults && (
        <button
          type="button"
          className={`px-2 py-1 rounded cursor-pointer mt-2 ${
            selectedIndex === visibleItems.length ? "bg-blue-500/20 text-blue-300" : "hover:bg-gray-800"
          }`}
          onClick={() => {
            setPage((p) => p + 1);
            setSelectedIndex(0);
          }}
          onMouseEnter={() => setSelectedIndex(visibleItems.length)}
        >
          → Show next {Math.min(ITEMS_PER_PAGE, validItems.length - endIdx)} results
        </button>
      )}
    </div>
  );
}
