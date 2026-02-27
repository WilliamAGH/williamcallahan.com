"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FeedToggleProps } from "@/types/features/bookmarks";

const FEED_OPTIONS = [
  { label: "Discover", value: "discover" },
  { label: "Latest", value: "latest" },
] as const;

export function FeedToggle({ mode, onChange }: Readonly<FeedToggleProps>) {
  return (
    <div
      className="inline-flex items-center rounded-md bg-gray-200/70 dark:bg-gray-800/70 p-0.5 font-mono"
      role="tablist"
      aria-label="Bookmark feed mode"
    >
      {FEED_OPTIONS.map((option) => {
        const isActive = option.value === mode;
        return (
          <Button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.value)}
            size="sm"
            variant={isActive ? "secondary" : "ghost"}
            className={cn(
              "rounded px-2.5 py-1 font-medium transition-all duration-150",
              isActive
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200",
            )}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
