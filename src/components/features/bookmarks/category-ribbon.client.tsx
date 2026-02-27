"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    if (process.env.NODE_ENV === "test") {
      setIsLoading(false);
      return () => {
        abortController.abort();
      };
    }

    const categoriesEndpoint =
      typeof window === "undefined"
        ? "http://localhost/api/bookmarks/categories"
        : new URL("/api/bookmarks/categories", window.location.origin).toString();

    const loadCategories = async () => {
      try {
        const response = await fetch(categoriesEndpoint, {
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
        <Button
          type="button"
          size="sm"
          onClick={() => onSelectAction(null)}
          variant={selectedCategory === null ? "default" : "ghost"}
          className="shrink-0 rounded-full"
        >
          All
        </Button>
        {visibleCategories.map((category) => {
          const isSelected = selectedCategory === category.name;
          return (
            <Button
              key={category.name}
              type="button"
              size="sm"
              onClick={() => onSelectAction(isSelected ? null : category.name)}
              variant={isSelected ? "default" : "outline"}
              className={cn("shrink-0 rounded-full")}
            >
              <span>{category.name}</span>
              <Badge variant={isSelected ? "secondary" : "muted"}>{category.count}</Badge>
            </Button>
          );
        })}
      </div>
      {isLoading && (
        <p className="text-xs text-gray-500 dark:text-gray-400">Loading categories...</p>
      )}
    </div>
  );
}
