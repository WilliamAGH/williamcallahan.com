/**
 * Thought Card Component
 * @module components/features/thoughts/thought-card
 * @description
 * Displays a preview of a thought in a list context.
 * Features a "captured thought" aesthetic with warm amber accents,
 * prominent date display, and elegant editorial typography.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatDate, cn } from "@/lib/utils";
import type { ThoughtCardProps, ThoughtCardCategoryColor } from "@/types/features/thoughts";

/**
 * Default category colors (used for fallback)
 */
const defaultCategoryColor: ThoughtCardCategoryColor = {
  border: "border-l-amber-400/60 dark:border-l-amber-500/40",
  text: "text-zinc-600 dark:text-zinc-400",
  bg: "bg-zinc-50/30 dark:bg-zinc-800/20",
};

/**
 * Category color configuration for visual distinction
 * Each category gets a unique warm-toned accent
 */
const categoryColorMap = new Map<string, ThoughtCardCategoryColor>([
  [
    "python",
    {
      border: "border-l-blue-400 dark:border-l-blue-500",
      text: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50/50 dark:bg-blue-950/20",
    },
  ],
  [
    "css",
    {
      border: "border-l-pink-400 dark:border-l-pink-500",
      text: "text-pink-600 dark:text-pink-400",
      bg: "bg-pink-50/50 dark:bg-pink-950/20",
    },
  ],
  [
    "typescript",
    {
      border: "border-l-sky-400 dark:border-l-sky-500",
      text: "text-sky-600 dark:text-sky-400",
      bg: "bg-sky-50/50 dark:bg-sky-950/20",
    },
  ],
  [
    "tooling",
    {
      border: "border-l-amber-400 dark:border-l-amber-500",
      text: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50/50 dark:bg-amber-950/20",
    },
  ],
  [
    "javascript",
    {
      border: "border-l-yellow-400 dark:border-l-yellow-500",
      text: "text-yellow-600 dark:text-yellow-400",
      bg: "bg-yellow-50/50 dark:bg-yellow-950/20",
    },
  ],
  [
    "react",
    {
      border: "border-l-cyan-400 dark:border-l-cyan-500",
      text: "text-cyan-600 dark:text-cyan-400",
      bg: "bg-cyan-50/50 dark:bg-cyan-950/20",
    },
  ],
]);

/**
 * Get category-specific colors or fallback to default
 */
function getCategoryColors(category: string | undefined): ThoughtCardCategoryColor {
  if (!category) return defaultCategoryColor;
  return categoryColorMap.get(category.toLowerCase()) ?? defaultCategoryColor;
}

/**
 * Calculate estimated reading time from excerpt
 * Thoughts are short-form, so reading times are brief
 */
function estimateReadingTime(excerpt: string | undefined): string {
  if (!excerpt) return "< 1 min";
  const words = excerpt.split(/\s+/).length;
  const minutes = Math.max(1, Math.ceil(words / 200));
  return minutes === 1 ? "1 min" : `${minutes} min`;
}

/**
 * Format date into month abbreviation and day
 */
function formatDateParts(dateString: string): { month: string; day: string } {
  const date = new Date(dateString);
  return {
    month: date.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    day: date.getDate().toString().padStart(2, "0"),
  };
}

/**
 * ThoughtCard Component
 *
 * A "captured thought" card with warm aesthetic, prominent date sidebar,
 * and category-colored accents. Designed to feel like annotations
 * in a well-loved notebook.
 */
export function ThoughtCard({ thought, preload = false }: ThoughtCardProps) {
  const path = `/thoughts/${thought.slug}`;
  const readingTime = estimateReadingTime(thought.excerpt);
  const colors = getCategoryColors(thought.category);
  const { month, day } = formatDateParts(thought.createdAt);

  return (
    <article
      className={cn(
        "group relative",
        "flex items-stretch gap-0",
        // Subtle hover lift
        "transition-all duration-300 ease-out",
        "hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40",
      )}
    >
      {/* Date Sidebar - Prominent "captured at" display */}
      <div
        className={cn(
          "hidden sm:flex flex-col items-center justify-center",
          "w-16 py-6 flex-shrink-0",
          "border-r border-zinc-100 dark:border-zinc-800/50",
        )}
      >
        <span className="text-[0.65rem] font-mono tracking-wider text-amber-600/70 dark:text-amber-400/50">
          {month}
        </span>
        <span className="text-2xl font-bold text-amber-600/80 dark:text-amber-400/60 -mt-0.5 font-mono">{day}</span>
      </div>

      {/* Main Content Area */}
      <div
        className={cn(
          "flex-1 py-5 sm:py-6 px-5 sm:px-6",
          // Category-colored left border accent
          "border-l-[3px]",
          colors.border,
        )}
      >
        {/* Category Badge */}
        {thought.category && (
          <div className="mb-2.5">
            <Link
              href={`/thoughts?category=${encodeURIComponent(thought.category)}`}
              className={cn(
                "inline-flex items-center",
                "px-2 py-0.5",
                "text-[0.6rem] uppercase tracking-[0.2em] font-semibold",
                colors.text,
                colors.bg,
                "rounded-sm",
                "hover:opacity-80",
                "transition-opacity",
              )}
            >
              {thought.category}
            </Link>
          </div>
        )}

        {/* Title */}
        <h2 className="mb-2">
          <Link
            href={path}
            className={cn(
              "text-lg sm:text-xl font-semibold leading-snug",
              "text-zinc-900 dark:text-zinc-100",
              "hover:text-amber-700 dark:hover:text-amber-400",
              "transition-colors duration-200",
            )}
            prefetch={preload}
          >
            {thought.title}
          </Link>
        </h2>

        {/* Excerpt */}
        {thought.excerpt && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-2 mb-3">
            {thought.excerpt}
          </p>
        )}

        {/* Metadata Row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-500">
          {/* Mobile date (hidden on sm+) */}
          <time dateTime={thought.createdAt} className="sm:hidden" suppressHydrationWarning>
            {formatDate(thought.createdAt)}
          </time>

          {/* Reading Time */}
          <span className="flex items-center gap-1">
            <span className="text-amber-500/60">~</span>
            {readingTime} read
          </span>

          {/* Tags (show first 2) */}
          {thought.tags && thought.tags.length > 0 && (
            <>
              <span className="text-zinc-300 dark:text-zinc-700">·</span>
              <span className="truncate max-w-[180px] text-zinc-400 dark:text-zinc-500">
                {thought.tags.slice(0, 2).join(", ")}
                {thought.tags.length > 2 && ` +${thought.tags.length - 2}`}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Arrow indicator on hover */}
      <div
        className={cn(
          "hidden sm:flex items-center justify-center",
          "w-12 flex-shrink-0",
          "opacity-0 group-hover:opacity-100",
          "transition-all duration-300",
        )}
      >
        <Link
          href={path}
          className={cn(
            "p-2 rounded-full",
            "bg-amber-100/80 dark:bg-amber-900/30",
            "text-amber-600 dark:text-amber-400",
            "transform translate-x-2 group-hover:translate-x-0",
            "transition-transform duration-300",
          )}
          aria-label={`Read "${thought.title}"`}
        >
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </article>
  );
}
