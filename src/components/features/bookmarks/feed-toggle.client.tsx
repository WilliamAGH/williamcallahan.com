"use client";

import { cn } from "@/lib/utils";
import type { FeedToggleProps } from "@/types/features/bookmarks";

const FEED_OPTIONS = [
  { label: "Discover", value: "discover" },
  { label: "Latest", value: "latest" },
] as const;

export function FeedToggle({ mode, onChange }: Readonly<FeedToggleProps>) {
  return (
    <div
      className="inline-flex items-center rounded-full border border-gray-300/90 dark:border-gray-700 bg-gray-100/80 dark:bg-gray-800/70 p-1"
      role="tablist"
      aria-label="Bookmark feed mode"
    >
      {FEED_OPTIONS.map((option) => {
        const isActive = option.value === mode;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-full transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60",
              isActive
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
