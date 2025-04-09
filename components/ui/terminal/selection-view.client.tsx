/**
 * Selection View Component
 * 
 * Displays a list of selectable items with keyboard navigation
 */

"use client";

import { useState, useEffect } from 'react';
import type { SelectionItem } from '@/types/terminal';

interface SelectionViewProps {
  items: SelectionItem[];
  onSelect: (item: SelectionItem) => void;
  onExit: () => void;
}

export function SelectionView({ items, onSelect, onExit }: SelectionViewProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(i => (i > 0 ? i - 1 : items.length - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(i => (i < items.length - 1 ? i + 1 : 0));
          break;
        case 'Enter':
          e.preventDefault();
          onSelect(items[selectedIndex]);
          break;
        case 'Escape':
          e.preventDefault();
          onExit();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, selectedIndex, onSelect, onExit]);

  return (
    <div className="border border-gray-700 rounded-lg p-2 mt-2">
      <div className="text-sm text-gray-400 mb-2">
        Use ↑↓ to navigate, Enter to select, Esc to cancel
      </div>
      {items.map((item, index) => (
        <div
          key={index}
          className={`px-2 py-1 rounded cursor-pointer ${
            index === selectedIndex
              ? 'bg-blue-500/20 text-blue-300'
              : 'hover:bg-gray-800'
          }`}
          onClick={() => onSelect(item)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}