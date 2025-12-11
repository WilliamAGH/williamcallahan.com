/**
 * Thought Card Component
 * @module components/features/thoughts/thought-card
 * @description
 * Displays a preview of a thought in a list context.
 * Features an editorial "marginalia" aesthetic with left accent border,
 * category chips, and elegant typography.
 */

import Link from "next/link";
import { Calendar, Tag, ArrowRight } from "lucide-react";
import { formatDate, cn } from "@/lib/utils";
import type { ThoughtCardProps } from "@/types/features/thoughts";

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
 * Generate URL path for a thought
 */
function getThoughtPath(slug: string, category?: string): string {
  return category ? `/thoughts/${category}/${slug}` : `/thoughts/${slug}`;
}

/**
 * ThoughtCard Component
 *
 * An editorial-style card for displaying thought previews.
 * Uses a distinctive left border accent and refined typography
 * to create a "marginalia" or "aside" aesthetic.
 */
export function ThoughtCard({ thought, preload = false }: ThoughtCardProps) {
  const path = getThoughtPath(thought.slug, thought.category);
  const readingTime = estimateReadingTime(thought.excerpt);

  return (
    <article
      className={cn(
        "group relative",
        "pl-5 py-5 pr-6",
        // Left accent border - the signature "marginalia" style
        "border-l-2 border-zinc-200 dark:border-zinc-700",
        "hover:border-zinc-900 dark:hover:border-zinc-300",
        // Subtle background on hover
        "hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30",
        "transition-all duration-200 ease-out",
      )}
    >
      {/* Category Badge - Typewriter-style treatment */}
      {thought.category && (
        <div className="mb-3">
          <Link
            href={`/thoughts?category=${thought.category}`}
            className={cn(
              "inline-flex items-center gap-1.5",
              "px-2 py-0.5",
              "text-[0.65rem] uppercase tracking-[0.2em] font-medium",
              "text-zinc-500 dark:text-zinc-400",
              "border border-zinc-200 dark:border-zinc-700 rounded-sm",
              "hover:border-zinc-400 dark:hover:border-zinc-500",
              "hover:text-zinc-700 dark:hover:text-zinc-300",
              "transition-colors",
            )}
          >
            {thought.category}
          </Link>
        </div>
      )}

      {/* Title - Large and bold for scannability */}
      <h2 className="mb-2">
        <Link
          href={path}
          className={cn(
            "text-lg sm:text-xl font-semibold leading-snug",
            "text-zinc-900 dark:text-zinc-100",
            "hover:text-zinc-600 dark:hover:text-zinc-300",
            "transition-colors",
            // Subtle underline on hover
            "decoration-zinc-300 dark:decoration-zinc-600 decoration-1 underline-offset-4",
            "hover:underline",
          )}
          {...(preload ? { rel: "preload" } : {})}
        >
          {thought.title}
        </Link>
      </h2>

      {/* Excerpt - Subtle and readable */}
      {thought.excerpt && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-2 mb-4">{thought.excerpt}</p>
      )}

      {/* Metadata Row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-500 dark:text-zinc-500">
        {/* Date */}
        <span className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
          <time dateTime={thought.createdAt} suppressHydrationWarning>
            {formatDate(thought.createdAt)}
          </time>
        </span>

        {/* Reading Time */}
        <span className="text-zinc-400 dark:text-zinc-600">·</span>
        <span>{readingTime} read</span>

        {/* Tags (show first 2) */}
        {thought.tags && thought.tags.length > 0 && (
          <>
            <span className="text-zinc-400 dark:text-zinc-600">·</span>
            <span className="flex items-center gap-1.5">
              <Tag className="w-3 h-3" aria-hidden="true" />
              <span className="truncate max-w-[150px]">{thought.tags.slice(0, 2).join(", ")}</span>
              {thought.tags.length > 2 && <span className="text-zinc-400">+{thought.tags.length - 2}</span>}
            </span>
          </>
        )}
      </div>

      {/* Read More Arrow - Appears on hover */}
      <div
        className={cn(
          "absolute right-4 top-1/2 -translate-y-1/2",
          "opacity-0 group-hover:opacity-100",
          "translate-x-2 group-hover:translate-x-0",
          "transition-all duration-200",
        )}
      >
        <Link
          href={path}
          className="p-2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
          aria-label={`Read "${thought.title}"`}
        >
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </article>
  );
}
