"use client";

import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import type { BookmarkCategorySummary, CategoryRibbonProps } from "@/types/features/bookmarks";

function isBookmarkCategorySummary(entry: unknown): entry is BookmarkCategorySummary {
  return (
    typeof entry === "object" &&
    entry !== null &&
    "name" in entry &&
    "count" in entry &&
    typeof entry.name === "string" &&
    typeof entry.count === "number"
  );
}

function parseCategoriesResponse(payload: unknown): BookmarkCategorySummary[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const candidate = payload as { categories?: unknown };
  if (!Array.isArray(candidate.categories)) {
    return [];
  }

  return candidate.categories.filter(isBookmarkCategorySummary);
}

export function CategoryRibbon({
  selectedCategory,
  onSelectAction,
}: Readonly<CategoryRibbonProps>) {
  const [categories, setCategories] = useState<BookmarkCategorySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const abortController = new AbortController();

    const loadCategories = async () => {
      try {
        const response = await fetch("/api/bookmarks/categories", {
          signal: abortController.signal,
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`Failed to load categories: ${response.status}`);
        }

        const json: unknown = await response.json();
        setCategories(parseCategoriesResponse(json));
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        console.error("[CategoryRibbon] Failed to load categories:", error);
        setCategories([]);
      } finally {
        setIsLoading(false);
      }
    };

    void loadCategories();

    return () => {
      abortController.abort();
    };
  }, []);

  const visibleCategories = useMemo(() => categories.slice(0, 12), [categories]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => onSelectAction(null)}
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
            selectedCategory === null
              ? "bg-indigo-600 text-white shadow-sm"
              : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/60",
          )}
        >
          All
        </button>
        {visibleCategories.map((category) => {
          const isSelected = selectedCategory === category.name;
          return (
            <button
              key={category.name}
              type="button"
              onClick={() => onSelectAction(isSelected ? null : category.name)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                isSelected
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700",
              )}
            >
              {category.name}
              <span className="ml-1 opacity-70">{category.count}</span>
            </button>
          );
        })}
      </div>
      {isLoading && (
        <p className="text-xs text-gray-500 dark:text-gray-400">Loading categories...</p>
      )}
    </div>
  );
}
