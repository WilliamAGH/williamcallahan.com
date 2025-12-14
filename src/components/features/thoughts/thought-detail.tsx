/**
 * Thought Detail Component
 * @module components/features/thoughts/thought-detail
 * @description
 * Full-page display for an individual thought with immersive typography,
 * ambient visual effects, and elegant content presentation.
 * Features a "spotlight" reading experience with warm amber accents.
 *
 * @clientComponent - Uses Framer Motion for scroll animations.
 */

"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Share2 } from "lucide-react";
import { formatDate, cn } from "@/lib/utils";
import { ThoughtsWindow } from "./thoughts-window.client";
import type { ThoughtDetailProps, ThoughtDetailCategoryColor } from "@/types/features/thoughts";

/**
 * Default category colors (used for fallback)
 */
const defaultCategoryColor: ThoughtDetailCategoryColor = {
  text: "text-amber-600 dark:text-amber-400",
  bg: "bg-amber-50/30 dark:bg-amber-950/20",
  glow: "from-amber-100/30 dark:from-amber-900/15",
};

/**
 * Category color configuration matching thought-card.tsx
 */
const categoryColorMap = new Map<string, ThoughtDetailCategoryColor>([
  [
    "python",
    {
      text: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50/50 dark:bg-blue-950/20",
      glow: "from-blue-100/40 dark:from-blue-900/20",
    },
  ],
  [
    "css",
    {
      text: "text-pink-600 dark:text-pink-400",
      bg: "bg-pink-50/50 dark:bg-pink-950/20",
      glow: "from-pink-100/40 dark:from-pink-900/20",
    },
  ],
  [
    "typescript",
    {
      text: "text-sky-600 dark:text-sky-400",
      bg: "bg-sky-50/50 dark:bg-sky-950/20",
      glow: "from-sky-100/40 dark:from-sky-900/20",
    },
  ],
  [
    "tooling",
    {
      text: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50/50 dark:bg-amber-950/20",
      glow: "from-amber-100/40 dark:from-amber-900/20",
    },
  ],
  [
    "javascript",
    {
      text: "text-yellow-600 dark:text-yellow-400",
      bg: "bg-yellow-50/50 dark:bg-yellow-950/20",
      glow: "from-yellow-100/40 dark:from-yellow-900/20",
    },
  ],
  [
    "react",
    {
      text: "text-cyan-600 dark:text-cyan-400",
      bg: "bg-cyan-50/50 dark:bg-cyan-950/20",
      glow: "from-cyan-100/40 dark:from-cyan-900/20",
    },
  ],
]);

/**
 * Get category-specific colors or fallback to default
 */
function getCategoryColors(category: string | undefined): ThoughtDetailCategoryColor {
  if (!category) return defaultCategoryColor;
  return categoryColorMap.get(category.toLowerCase()) ?? defaultCategoryColor;
}

/**
 * Calculate reading time from content
 */
function calculateReadingTime(content: string): number {
  const words = content.split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

/**
 * ThoughtDetail Component
 *
 * An immersive, typography-focused display for individual thoughts.
 * Features ambient glow effect, generous whitespace, and warm accents
 * to create a "spotlight" reading experience.
 */
export function ThoughtDetail({ thought }: ThoughtDetailProps) {
  const readingTime = useMemo(() => calculateReadingTime(thought.content), [thought.content]);
  const colors = getCategoryColors(thought.category);

  return (
    <ThoughtsWindow windowTitle={`~/thoughts/${thought.slug}`} windowId={`thought-detail-${thought.id}`}>
      <article className="relative py-8 sm:py-12 px-4 sm:px-8 lg:px-12">
        {/* Ambient Glow Effect - Creates "spotlight" feeling */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div
            className={cn(
              "absolute top-1/4 left-1/2 -translate-x-1/2",
              "w-[500px] h-[350px] sm:w-[700px] sm:h-[450px]",
              "bg-gradient-radial via-transparent to-transparent",
              colors.glow,
              "blur-3xl opacity-60",
            )}
          />
        </div>

        <div className="relative max-w-2xl mx-auto">
          {/* Back Navigation */}
          <motion.div initial={false} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }} className="mb-10">
            <Link
              href="/thoughts"
              className={cn(
                "inline-flex items-center gap-2",
                "text-sm text-zinc-500 dark:text-zinc-400",
                "hover:text-amber-600 dark:hover:text-amber-400",
                "transition-colors group",
              )}
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span>All Thoughts</span>
            </Link>
          </motion.div>

          {/* Header Section */}
          <motion.header
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-12"
          >
            {/* Category as subtle file label */}
            {thought.category && (
              <div className="mb-6 flex items-center gap-3">
                <div className="w-8 h-px bg-amber-400/60 dark:bg-amber-500/40" />
                <Link
                  href={`/thoughts?category=${encodeURIComponent(thought.category)}`}
                  className={cn(
                    "text-[0.6rem] tracking-[0.35em] uppercase font-semibold",
                    colors.text,
                    "hover:opacity-80 transition-opacity",
                  )}
                >
                  {thought.category}
                </Link>
              </div>
            )}

            {/* Title - Large and dramatic */}
            <h1
              className={cn(
                "text-3xl sm:text-4xl md:text-5xl lg:text-[3.25rem]",
                "font-bold leading-[1.1] tracking-tight",
                "text-zinc-900 dark:text-zinc-50",
                "mb-8",
              )}
            >
              {thought.title}
            </h1>

            {/* Metadata as quiet caption */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-zinc-500 dark:text-zinc-500">
              <time dateTime={thought.createdAt} className="font-mono text-xs tracking-wide" suppressHydrationWarning>
                {formatDate(thought.createdAt)}
              </time>

              {thought.updatedAt && thought.updatedAt !== thought.createdAt && (
                <>
                  <span className="text-zinc-300 dark:text-zinc-700">·</span>
                  <span className="text-xs" suppressHydrationWarning>
                    Updated {formatDate(thought.updatedAt)}
                  </span>
                </>
              )}

              <span className="text-zinc-300 dark:text-zinc-700">·</span>
              <span className="text-xs">
                <span className="text-amber-500/70">~</span> {readingTime} min read
              </span>
            </div>
          </motion.header>

          {/* Content - The Star of the Show */}
          <motion.div
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={cn(
              // Typography - generous leading and readable measure
              "prose prose-zinc dark:prose-invert",
              "prose-lg sm:prose-xl",
              "max-w-none",
              // First letter drop cap styling
              "[&>div>p:first-of-type]:first-letter:text-5xl",
              "[&>div>p:first-of-type]:first-letter:font-bold",
              "[&>div>p:first-of-type]:first-letter:float-left",
              "[&>div>p:first-of-type]:first-letter:mr-3",
              "[&>div>p:first-of-type]:first-letter:mt-1",
              "[&>div>p:first-of-type]:first-letter:text-amber-600",
              "dark:[&>div>p:first-of-type]:first-letter:text-amber-400",
              // Headings
              "prose-headings:font-semibold prose-headings:tracking-tight",
              "prose-headings:text-zinc-900 dark:prose-headings:text-zinc-100",
              // Links with amber accent
              "prose-a:text-amber-700 dark:prose-a:text-amber-400",
              "prose-a:decoration-amber-300/50 dark:prose-a:decoration-amber-600/50",
              "prose-a:underline-offset-2 prose-a:decoration-1",
              "hover:prose-a:decoration-amber-500",
              // Code
              "prose-code:text-zinc-800 dark:prose-code:text-zinc-200",
              "prose-code:bg-zinc-100 dark:prose-code:bg-zinc-800",
              "prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded",
              "prose-code:before:content-none prose-code:after:content-none",
              "prose-code:font-normal",
              // Pre/Code blocks
              "prose-pre:bg-zinc-900 dark:prose-pre:bg-zinc-950",
              "prose-pre:border prose-pre:border-zinc-800",
              // Blockquotes - warm editorial style
              "prose-blockquote:border-l-2 prose-blockquote:border-amber-300 dark:prose-blockquote:border-amber-600/50",
              "prose-blockquote:pl-4 prose-blockquote:italic",
              "prose-blockquote:text-zinc-600 dark:prose-blockquote:text-zinc-400",
              // Lists
              "prose-li:marker:text-amber-400/70 dark:prose-li:marker:text-amber-500/50",
              // Strong/Bold
              "prose-strong:text-zinc-900 dark:prose-strong:text-zinc-100",
              // Images
              "prose-img:rounded-lg prose-img:shadow-md",
            )}
          >
            <div className="whitespace-pre-wrap">{thought.content}</div>
          </motion.div>

          {/* Tags Section */}
          {thought.tags && thought.tags.length > 0 && (
            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-14 pt-8 border-t border-zinc-200/80 dark:border-zinc-800/60"
            >
              <h2 className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-zinc-400 dark:text-zinc-500 mb-4 flex items-center gap-2">
                <div className="w-4 h-px bg-amber-400/50" />
                Topics
              </h2>
              <div className="flex flex-wrap gap-2">
                {thought.tags.map(tag => (
                  <Link
                    key={tag}
                    href={`/thoughts?tag=${encodeURIComponent(tag)}`}
                    className={cn(
                      "px-3 py-1.5",
                      "text-sm",
                      "bg-zinc-100/80 dark:bg-zinc-800/60",
                      "text-zinc-600 dark:text-zinc-400",
                      "rounded-md",
                      "border border-zinc-200/50 dark:border-zinc-700/50",
                      "hover:border-amber-300 dark:hover:border-amber-700",
                      "hover:text-amber-700 dark:hover:text-amber-400",
                      "transition-colors",
                    )}
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            </motion.div>
          )}

          {/* Footer Actions */}
          <motion.footer
            initial={false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="mt-12 pt-8 border-t border-zinc-200/80 dark:border-zinc-800/60"
          >
            <div className="flex items-center justify-between">
              {/* Back to All */}
              <Link
                href="/thoughts"
                className={cn(
                  "inline-flex items-center gap-2",
                  "px-4 py-2",
                  "text-sm font-medium",
                  "bg-amber-50 dark:bg-amber-950/30",
                  "text-amber-700 dark:text-amber-400",
                  "border border-amber-200/50 dark:border-amber-800/50",
                  "rounded-lg",
                  "hover:bg-amber-100 dark:hover:bg-amber-900/40",
                  "transition-colors",
                )}
              >
                <ArrowLeft className="w-4 h-4" />
                All Thoughts
              </Link>

              {/* Share Button */}
              <button
                type="button"
                onClick={() => {
                  if (navigator.share) {
                    void navigator.share({
                      title: thought.title,
                      url: window.location.href,
                    });
                  } else {
                    void navigator.clipboard.writeText(window.location.href);
                  }
                }}
                className={cn(
                  "inline-flex items-center gap-2",
                  "px-4 py-2",
                  "text-sm font-medium",
                  "text-zinc-600 dark:text-zinc-400",
                  "rounded-lg",
                  "hover:bg-zinc-100 dark:hover:bg-zinc-800",
                  "hover:text-amber-600 dark:hover:text-amber-400",
                  "transition-colors",
                )}
                aria-label="Share this thought"
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>
            </div>
          </motion.footer>
        </div>
      </article>
    </ThoughtsWindow>
  );
}
