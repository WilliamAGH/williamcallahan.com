/**
 * Terminal Search Hint Component
 *
 * A refined keyboard shortcut indicator that guides users to the terminal.
 * Inspired by the elegant shortcut badges in Linear, Raycast, and Notion.
 *
 * Desktop: Shows ⌘K (Mac) or Ctrl+K (Windows/Linux) keyboard shortcut badge
 * Mobile: Hidden entirely since physical keyboards aren't available
 *
 * @module components/ui/terminal/terminal-search-hint
 */

"use client";

import type { TerminalSearchHintProps } from "@/types/ui/terminal";
import { useEffect, useState } from "react";

/**
 * Elegant keyboard shortcut badge that points users to the terminal
 * Features a frosted glass aesthetic with keyboard key visual
 * Hidden on mobile viewports where keyboard shortcuts are irrelevant
 */
export function TerminalSearchHint({ context = "bookmarks" }: TerminalSearchHintProps) {
  const [mounted, setMounted] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsMac(navigator.platform.toLowerCase().includes("mac"));
  }, []);

  const contextText =
    context === "bookmarks"
      ? "bookmarks"
      : context === "projects"
        ? "projects"
        : context === "books"
          ? "books"
          : context === "thoughts"
            ? "thoughts"
            : "articles";

  // SSR placeholder - hidden on mobile via CSS to match the mounted state
  if (!mounted) {
    return <div className="hidden md:block h-7" aria-hidden="true" />;
  }

  /**
   * Trigger terminal focus by dispatching a synthetic keyboard event.
   * The terminal listens globally for ⌘K/Ctrl+K, so we simulate that keypress.
   */
  const activateTerminal = () => {
    const event = new KeyboardEvent("keydown", {
      key: "k",
      code: "KeyK",
      metaKey: isMac,
      ctrlKey: !isMac,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
  };

  return (
    <button
      type="button"
      onClick={activateTerminal}
      className="
        hidden md:inline-flex
        group
        items-center gap-2
        cursor-pointer select-none
        bg-transparent border-none p-0
        focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
        rounded-md
        transition-transform duration-150 ease-out
        hover:scale-[1.02] active:scale-[0.98]
      "
      aria-label={`Activate search for ${contextText}`}
    >
      {/* Keyboard key badge */}
      <kbd
        className="
          inline-flex items-center justify-center
          min-w-[24px] h-6 px-1.5
          text-[11px] font-medium tracking-wide
          text-gray-500 dark:text-gray-400
          bg-gradient-to-b from-gray-50 to-gray-100
          dark:from-gray-800 dark:to-gray-900
          border border-gray-200/80 dark:border-gray-700/60
          rounded-md
          shadow-[0_1px_0_1px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.6)]
          dark:shadow-[0_1px_0_1px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)]
          transition-all duration-150
          group-hover:border-gray-300 dark:group-hover:border-gray-600
          group-hover:shadow-[0_1px_0_1px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.7)]
          dark:group-hover:shadow-[0_1px_0_1px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)]
        "
      >
        {isMac ? "⌘" : "Ctrl"}
      </kbd>
      <span className="text-gray-300 dark:text-gray-600 text-xs">+</span>
      <kbd
        className="
          inline-flex items-center justify-center
          min-w-[24px] h-6 px-1.5
          text-[11px] font-medium tracking-wide
          text-gray-500 dark:text-gray-400
          bg-gradient-to-b from-gray-50 to-gray-100
          dark:from-gray-800 dark:to-gray-900
          border border-gray-200/80 dark:border-gray-700/60
          rounded-md
          shadow-[0_1px_0_1px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.6)]
          dark:shadow-[0_1px_0_1px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)]
          transition-all duration-150
          group-hover:border-gray-300 dark:group-hover:border-gray-600
          group-hover:shadow-[0_1px_0_1px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.7)]
          dark:group-hover:shadow-[0_1px_0_1px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)]
        "
      >
        K
      </kbd>

      {/* Contextual label */}
      <span
        className="
          ml-1 text-[11px] tracking-wide
          text-gray-400 dark:text-gray-500
          transition-colors duration-150
          group-hover:text-gray-500 dark:group-hover:text-gray-400
        "
      >
        to search {contextText}
      </span>
    </button>
  );
}
