/**
 * Bookmark Insights Component
 * @module components/features/bookmarks/bookmark-insights
 * @description
 * A visually stunning component that displays AI-generated summaries and personal notes
 * for bookmarks. Features distinct aesthetic approaches for dark and light modes with
 * glass-morphism effects, subtle animations, and beautiful typography.
 */

"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Sparkles, PenTool, Hash, Quote, Brain, Lightbulb } from "lucide-react";
import { useState, type JSX } from "react";
import type { BookmarkTag } from "@/types/bookmark";

export function BookmarkInsights({
  note,
  summary,
  tags = [],
  className,
}: {
  note?: string | null;
  summary?: string | null;
  tags?: Array<Partial<BookmarkTag>>;
  className?: string;
}): JSX.Element | null {
  const [isExpanded, setIsExpanded] = useState(false);

  // Filter AI tags for potential display
  const aiTags = tags.filter((tag) => tag.attachedBy === "ai");

  // Only render if we have actual content (not just null/empty strings)
  const hasNote = note && note.trim().length > 0;
  const hasSummary = summary && summary.trim().length > 0;
  const hasAiTags = aiTags.length > 0;

  if (!hasNote && !hasSummary && !hasAiTags) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn("relative w-full mt-4 overflow-hidden", className)}
    >
      {/* Main Container with Glass Effect */}
      <div
        className={cn(
          "relative rounded-2xl",
          // Dark mode: Glass morphism with gradient borders
          "dark:bg-gradient-to-br dark:from-zinc-900/60 dark:via-zinc-800/40 dark:to-zinc-900/60",
          "dark:backdrop-blur-xl dark:backdrop-saturate-150",
          "dark:border dark:border-white/10",
          "dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)]",
          // Light mode: Paper layers with soft shadows
          "bg-gradient-to-br from-white via-gray-50/50 to-white",
          "border border-gray-200/60",
          "shadow-[0_4px_24px_rgba(0,0,0,0.06)]",
          // Hover effects
          "transition-all duration-500 ease-out",
          "hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_12px_40px_rgba(0,0,0,0.6)]",
          "hover:scale-[1.01]",
        )}
      >
        {/* Decorative gradient orb - only visible in dark mode */}
        <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-gradient-to-br from-purple-500/20 via-blue-500/20 to-transparent blur-3xl dark:block hidden" />

        {/* Personal Note Section */}
        {hasNote && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className={cn("relative p-6 border-b", "dark:border-white/10 border-gray-200/60")}
          >
            {/* Section Header */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-lg",
                  "bg-gradient-to-br from-amber-500/20 to-orange-500/20",
                  "dark:from-amber-400/20 dark:to-orange-400/20",
                  "backdrop-blur-sm",
                )}
              >
                <PenTool className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <h3
                className={cn(
                  "text-sm font-medium tracking-wide",
                  "text-gray-700 dark:text-gray-300",
                )}
              >
                Personal Note
              </h3>
            </div>

            {/* Note Content with Quote Styling */}
            <div className="relative pl-4">
              <Quote className="absolute -left-1 -top-1 w-5 h-5 text-amber-500/30 dark:text-amber-400/20 rotate-180" />
              <p
                className={cn(
                  "text-base leading-relaxed",
                  "text-gray-800 dark:text-gray-100",
                  "font-light tracking-wide",
                  "selection:bg-amber-200/30 dark:selection:bg-amber-400/20",
                )}
              >
                {note}
              </p>
            </div>
          </motion.div>
        )}

        {/* AI Summary Section */}
        {hasSummary && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className={cn(
              "relative p-6",
              hasNote && "border-t dark:border-white/5 border-gray-100",
            )}
          >
            {/* Section Header */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-lg",
                  "bg-gradient-to-br from-violet-500/20 to-purple-500/20",
                  "dark:from-violet-400/20 dark:to-purple-400/20",
                  "backdrop-blur-sm",
                  "animate-pulse",
                )}
              >
                <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              </div>
              <h3
                className={cn(
                  "text-sm font-medium tracking-wide",
                  "text-gray-700 dark:text-gray-300",
                )}
              >
                AI Summary
              </h3>
            </div>

            {/* Summary Content */}
            <div
              className={cn(
                "relative",
                "p-4 rounded-xl",
                "bg-gradient-to-br from-violet-50/50 to-purple-50/50",
                "dark:from-violet-900/10 dark:to-purple-900/10",
                "border border-violet-200/30 dark:border-violet-500/10",
              )}
            >
              <Brain className="absolute right-4 top-4 w-16 h-16 text-violet-200/20 dark:text-violet-400/10" />
              <div
                className={cn(
                  "text-base leading-relaxed relative z-10 space-y-3",
                  "text-gray-700 dark:text-gray-200",
                  "selection:bg-violet-200/30 dark:selection:bg-violet-400/20",
                )}
              >
                {summary.split("\n\n").map((paragraph) => (
                  <p key={paragraph.substring(0, 50)}>{paragraph}</p>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* AI-Generated Tags Section */}
        {hasAiTags && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className={cn(
              "relative px-6 pb-6",
              (hasNote || hasSummary) && "pt-4 border-t dark:border-white/5 border-gray-100",
            )}
          >
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                AI Suggested Tags
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {aiTags.map((tag, index) => (
                <motion.span
                  key={tag.name}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 + index * 0.05 }}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full",
                    "text-xs font-medium",
                    "bg-gradient-to-r from-blue-100 to-cyan-100",
                    "dark:from-blue-900/30 dark:to-cyan-900/30",
                    "text-blue-700 dark:text-blue-300",
                    "border border-blue-200/50 dark:border-blue-500/20",
                    "hover:scale-105 transition-transform duration-200",
                  )}
                >
                  <Hash className="w-3 h-3" />
                  {tag.name}
                </motion.span>
              ))}
            </div>
          </motion.div>
        )}

        {/* Expand/Collapse Button for long content */}
        {(note && note.length > 200) || (summary && summary.length > 200) ? (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className={cn(
              "absolute bottom-2 right-2",
              "px-3 py-1 rounded-lg",
              "text-xs font-medium",
              "bg-white/50 dark:bg-black/30",
              "backdrop-blur-sm",
              "text-gray-600 dark:text-gray-400",
              "hover:bg-white/70 dark:hover:bg-black/50",
              "transition-all duration-200",
            )}
          >
            {isExpanded ? "Show less" : "Show more"}
          </button>
        ) : null}
      </div>

      {/* Ambient glow effect for dark mode */}
      <div className="absolute inset-0 -z-10 dark:block hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600/5 via-transparent to-blue-600/5 blur-2xl" />
      </div>
    </motion.div>
  );
}

/**
 * Skeleton loader for BookmarkInsights
 */
export function BookmarkInsightsSkeleton(): JSX.Element {
  return (
    <div
      className={cn(
        "relative w-full mt-4 rounded-2xl",
        "dark:bg-zinc-900/60 bg-gray-50",
        "dark:border dark:border-white/10 border border-gray-200/60",
        "animate-pulse",
      )}
    >
      <div className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-gray-300/50 dark:bg-gray-700/50" />
          <div className="h-4 w-24 rounded bg-gray-300/50 dark:bg-gray-700/50" />
        </div>
        <div className="space-y-2">
          <div className="h-4 rounded bg-gray-300/30 dark:bg-gray-700/30" />
          <div className="h-4 w-5/6 rounded bg-gray-300/30 dark:bg-gray-700/30" />
          <div className="h-4 w-4/6 rounded bg-gray-300/30 dark:bg-gray-700/30" />
        </div>
      </div>
    </div>
  );
}
