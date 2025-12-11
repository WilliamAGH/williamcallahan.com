/**
 * Thought Detail Component
 * @module components/features/thoughts/thought-detail
 * @description
 * Full-page display for an individual thought with immersive typography
 * and elegant content presentation. Features Framer Motion animations
 * for a refined reading experience.
 *
 * @clientComponent - Uses Framer Motion for scroll animations.
 */

"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Calendar, Clock, ArrowLeft, Tag, Lightbulb, Share2 } from "lucide-react";
import { formatDate, cn } from "@/lib/utils";
import { ThoughtsWindow } from "./thoughts-window.client";
import type { ThoughtDetailProps } from "@/types/features/thoughts";

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
 * Uses generous whitespace and refined styling to celebrate short-form content.
 */
export function ThoughtDetail({ thought }: ThoughtDetailProps) {
  const readingTime = useMemo(() => calculateReadingTime(thought.content), [thought.content]);

  return (
    <ThoughtsWindow windowTitle={`~/thoughts/${thought.slug}`} windowId={`thought-detail-${thought.id}`}>
      <article className="py-6 sm:py-10 px-4 sm:px-8 lg:px-12">
        <div className="max-w-2xl mx-auto">
          {/* Back Navigation */}
          <motion.div initial={false} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }} className="mb-8">
            <Link
              href="/thoughts"
              className={cn(
                "inline-flex items-center gap-2",
                "text-sm text-zinc-500 dark:text-zinc-400",
                "hover:text-zinc-700 dark:hover:text-zinc-300",
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
            className="mb-10"
          >
            {/* Category Badge */}
            {thought.category && (
              <div className="mb-4">
                <Link
                  href={`/thoughts?category=${thought.category}`}
                  className={cn(
                    "inline-flex items-center gap-1.5",
                    "px-2.5 py-1",
                    "text-[0.65rem] uppercase tracking-[0.25em] font-medium",
                    "text-zinc-500 dark:text-zinc-400",
                    "border border-zinc-200 dark:border-zinc-700 rounded",
                    "hover:border-zinc-400 dark:hover:border-zinc-500",
                    "hover:text-zinc-700 dark:hover:text-zinc-300",
                    "transition-colors",
                  )}
                >
                  <Lightbulb className="w-3 h-3" />
                  {thought.category}
                </Link>
              </div>
            )}

            {/* Title */}
            <h1
              className={cn(
                "text-3xl sm:text-4xl md:text-5xl",
                "font-bold leading-tight tracking-tight",
                "text-zinc-900 dark:text-zinc-50",
                "mb-6",
              )}
            >
              {thought.title}
            </h1>

            {/* Metadata Row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" aria-hidden="true" />
                <time dateTime={thought.createdAt} suppressHydrationWarning>
                  {formatDate(thought.createdAt)}
                </time>
              </span>

              {thought.updatedAt && thought.updatedAt !== thought.createdAt && (
                <>
                  <span className="text-zinc-300 dark:text-zinc-600">·</span>
                  <span suppressHydrationWarning>Updated {formatDate(thought.updatedAt)}</span>
                </>
              )}

              <span className="text-zinc-300 dark:text-zinc-600">·</span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" aria-hidden="true" />
                {readingTime} min read
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
              // Headings
              "prose-headings:font-semibold prose-headings:tracking-tight",
              "prose-headings:text-zinc-900 dark:prose-headings:text-zinc-100",
              // Links
              "prose-a:text-zinc-700 dark:prose-a:text-zinc-300",
              "prose-a:decoration-zinc-300 dark:prose-a:decoration-zinc-600",
              "prose-a:underline-offset-2",
              "hover:prose-a:decoration-zinc-500",
              // Code
              "prose-code:text-zinc-800 dark:prose-code:text-zinc-200",
              "prose-code:bg-zinc-100 dark:prose-code:bg-zinc-800",
              "prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded",
              "prose-code:before:content-none prose-code:after:content-none",
              // Pre/Code blocks
              "prose-pre:bg-zinc-900 dark:prose-pre:bg-zinc-950",
              "prose-pre:border prose-pre:border-zinc-800",
              // Blockquotes - editorial style
              "prose-blockquote:border-l-2 prose-blockquote:border-zinc-300 dark:prose-blockquote:border-zinc-600",
              "prose-blockquote:pl-4 prose-blockquote:italic",
              "prose-blockquote:text-zinc-600 dark:prose-blockquote:text-zinc-400",
              // Lists
              "prose-li:marker:text-zinc-400 dark:prose-li:marker:text-zinc-600",
              // Strong/Bold
              "prose-strong:text-zinc-900 dark:prose-strong:text-zinc-100",
              // Images
              "prose-img:rounded-lg prose-img:shadow-md",
            )}
          >
            {/*
              Content is expected to be rendered as MDX or processed markdown.
              For now, we render it as raw text with basic formatting.
              This should be enhanced with a proper markdown renderer.
            */}
            <div className="whitespace-pre-wrap">{thought.content}</div>
          </motion.div>

          {/* Tags Section */}
          {thought.tags && thought.tags.length > 0 && (
            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-12 pt-8 border-t border-zinc-200 dark:border-zinc-800"
            >
              <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500 dark:text-zinc-400 mb-4 flex items-center gap-2">
                <Tag className="w-3.5 h-3.5" />
                Topics
              </h2>
              <div className="flex flex-wrap gap-2">
                {thought.tags.map(tag => (
                  <Link
                    key={tag}
                    href={`/thoughts?tag=${tag}`}
                    className={cn(
                      "px-3 py-1.5",
                      "text-sm",
                      "bg-zinc-100 dark:bg-zinc-800",
                      "text-zinc-700 dark:text-zinc-300",
                      "rounded-md",
                      "hover:bg-zinc-200 dark:hover:bg-zinc-700",
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
            className="mt-12 pt-8 border-t border-zinc-200 dark:border-zinc-800"
          >
            <div className="flex items-center justify-between">
              {/* Back to All */}
              <Link
                href="/thoughts"
                className={cn(
                  "inline-flex items-center gap-2",
                  "px-4 py-2",
                  "text-sm font-medium",
                  "bg-zinc-100 dark:bg-zinc-800",
                  "text-zinc-700 dark:text-zinc-300",
                  "rounded-lg",
                  "hover:bg-zinc-200 dark:hover:bg-zinc-700",
                  "transition-colors",
                )}
              >
                <Lightbulb className="w-4 h-4" />
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
