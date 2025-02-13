/**
 * Selection View Component
 *
 * A reusable component that displays an interactive, keyboard-navigable list of options in the terminal interface.
 * Provides full keyboard navigation, focus management, and ARIA support for accessibility.
 *
 * Features:
 * - Keyboard navigation (up/down arrows)
 * - Selection via Enter key
 * - Exit/cancel via Escape key
 * - Mouse interaction support
 * - Focus management for keyboard users
 * - ARIA attributes for screen readers
 *
 * @module
 * @see {@link SelectionItem} - The data structure for selectable items
 * @see {@link Terminal} - Parent terminal component
 * @see {@link navigationCommands} - Navigation command processing
 * @see {@link handleCommand} - Command processing that uses SelectionView for results
 */

"use client";

import { useEffect, useRef, useState } from "react";
import type { SelectionItem } from "@/types/terminal";

/**
 * Props for the SelectionView component
 *
 * @interface SelectionViewProps
 * @property {SelectionItem[]} items - Array of selectable items to display
 * @property {(item: SelectionItem) => void} onSelect - Callback function when an item is selected
 * @property {() => void} onExit - Callback function when selection is cancelled
 * @property {string} [aria-label] - Accessibility label for the listbox
 * @property {string} [data-testid] - Test ID for testing purposes
 */
interface SelectionViewProps {
  items: SelectionItem[];
  onSelect: (item: SelectionItem) => void;
  onExit: () => void;
  'aria-label'?: string;
  "data-testid"?: string;
  role?: string;
}

export function SelectionView({
  items,
  onSelect,
  onExit,
  'aria-label': ariaLabel = 'Available options',
  "data-testid": testId
}: SelectionViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedRef = useRef<HTMLDivElement>(null);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex(prev => Math.max(0, prev - 1));
          break;
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex(prev => Math.min(items.length - 1, prev + 1));
          break;
        case "Enter":
          e.preventDefault();
          const selectedItem = items[selectedIndex];
          if (selectedItem) {
            onSelect(selectedItem);
          }
          break;
        case "Escape":
          e.preventDefault();
          onExit();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [items, selectedIndex, onSelect, onExit]);

  // Focus management
  useEffect(() => {
    selectedRef.current?.focus();
  }, [selectedIndex]);

  return (
    <div
      role="listbox"
      aria-label={ariaLabel}
      data-testid={testId}
      className="mt-2 space-y-1"
    >
      {items.map((item, index) => {
        const isSelected = index === selectedIndex;
        return (
          <div
            key={item.value}
            ref={index === selectedIndex ? selectedRef : null}
            role="option"
            aria-selected={isSelected}
            className={`w-full text-left px-2 py-1 hover:bg-gray-700 cursor-pointer rounded ${
              isSelected ? "bg-gray-700" : ""
            }`}
            onClick={() => onSelect(item)}
            onMouseEnter={() => setSelectedIndex(index)}
            tabIndex={index === selectedIndex ? 0 : -1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(item);
              }
            }}
          >
            {item.label}
          </div>
        );
      })}
      <div className="mt-2 text-gray-500" role="note">
        Use arrow keys to navigate, Enter to select, Esc to cancel
      </div>
    </div>
  );
}