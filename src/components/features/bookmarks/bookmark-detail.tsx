"use client";

import { useMemo, useEffect, useState } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import type { UnifiedBookmark, BookmarkTag } from "@/types";
import {
  Calendar,
  Clock,
  User,
  Globe,
  ExternalLink,
  BookOpen,
  Archive,
  Star,
  ArrowUpRight,
  Bookmark,
  Library,
  Quote,
  ChevronLeft,
  Github,
} from "lucide-react";
import { selectBestImage } from "@/lib/bookmarks/bookmark-helpers";
import { formatDate } from "@/lib/utils";
import { BookmarksWindow } from "./bookmarks-window.client";
import { BookmarkAiAnalysis } from "./bookmark-ai-analysis.client";
import { tagToSlug } from "@/lib/utils/tag-utils";
import { removeCitations, processSummaryText } from "@/lib/utils/formatters";
import { safeExternalHref, getDisplayHostname, isGitHubUrl } from "@/lib/utils/url-utils";
import { OptimizedCardImage } from "@/components/ui/logo-image.client";
import { TerminalContext } from "@/components/ui/context-notes/terminal-context.client";
import { RegistryLinks } from "@/components/ui/registry-links.client";

// Helper to avoid rendering the literal "Invalid Date"
function toDisplayDate(date?: string | Date | number | null): string | null {
  if (date == null) return null;
  const text = formatDate(date);
  return text === "Invalid Date" ? null : text;
}

export function BookmarkDetail({ bookmark }: { bookmark: UnifiedBookmark }) {
  const [mounted, setMounted] = useState(false);
  const { scrollY } = useScroll();

  // Subtle parallax for image
  const imageY = useTransform(scrollY, [0, 300], [0, -20]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Extract domain for display with case-insensitive scheme detection
  const domain = useMemo(() => getDisplayHostname(bookmark.url), [bookmark.url]);

  // Sanitize URL using the shared utility
  const safeUrl = useMemo(() => safeExternalHref(bookmark.url), [bookmark.url]);

  // Check if this is a GitHub URL for special styling
  const isGitHub = useMemo(() => isGitHubUrl(bookmark.url), [bookmark.url]);

  // Calculate reading time display
  const readingTimeDisplay = useMemo(() => {
    if (!bookmark.readingTime) return null;
    const minutes = Math.ceil(bookmark.readingTime);
    return `${minutes} min`;
  }, [bookmark.readingTime]);

  // Use helper to prevent "Invalid Date" from appearing
  const rawPublished = bookmark.content?.datePublished || bookmark.datePublished;
  const publishedDate = toDisplayDate(rawPublished);
  const bookmarkedDate = toDisplayDate(bookmark.dateBookmarked);
  const updatedDate = toDisplayDate(bookmark.dateUpdated);

  // Get best image for display
  const featuredImage = selectBestImage(bookmark, {
    includeScreenshots: true,
  });

  if (!mounted) return null;

  return (
    <BookmarksWindow windowTitle="~/bookmarks" windowId={`bookmark-detail-${bookmark.id}`}>
      <div className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Library Context */}
          <div className="mb-3 sm:mb-4 space-y-1">
            <Link
              href="/bookmarks"
              className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 inline-flex items-center gap-1 transition-colors group"
            >
              <ChevronLeft className="w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors -ml-1" />
              <Bookmark className="w-3.5 h-3.5" />
              <span>William&apos;s Bookmark Library</span>
            </Link>
            <div>
              <TerminalContext type="bookmark" />
            </div>
          </div>

          {/* Header Section */}
          <div className="mb-6 sm:mb-8">
            {/* Title - Much larger for proper hierarchy */}
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 sm:mb-5 leading-tight">
              <a
                href={safeUrl ?? "/bookmarks"}
                target={safeUrl ? "_blank" : undefined}
                rel={safeUrl ? "noopener noreferrer" : undefined}
                className="text-gray-900 dark:text-gray-100 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                {bookmark.title}
              </a>
            </h1>

            {/* Status Badges - Only if present */}
            {(bookmark.archived || bookmark.isFavorite) && (
              <div className="flex gap-2 mb-3">
                {bookmark.archived && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-gray-800 rounded-md text-xs font-medium text-gray-600 dark:text-gray-400">
                    <Archive className="w-3 h-3" />
                    Archived
                  </span>
                )}
                {bookmark.isFavorite && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 dark:bg-amber-900/20 rounded-md text-xs font-medium text-amber-600 dark:text-amber-500">
                    <Star className="w-3 h-3 fill-current" />
                    Favorite
                  </span>
                )}
              </div>
            )}

            {/* Clean Metadata Line */}
            <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
              {/* Domain with link */}
              <a
                href={safeUrl ?? "/bookmarks"}
                target={safeUrl ? "_blank" : undefined}
                rel={safeUrl ? "noopener noreferrer" : undefined}
                className="inline-flex items-center gap-1.5 font-medium hover:text-gray-900 dark:hover:text-gray-100 transition-colors group"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>{domain}</span>
                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>

              {bookmarkedDate && (
                <span className="flex items-center gap-1.5">
                  <Library className="w-3.5 h-3.5" />
                  <span suppressHydrationWarning>Saved {bookmarkedDate}</span>
                </span>
              )}

              {readingTimeDisplay && (
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {readingTimeDisplay}
                </span>
              )}

              {publishedDate && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  <span suppressHydrationWarning>{publishedDate}</span>
                </span>
              )}
            </div>
          </div>

          {/* Main Content Grid - Mobile-first approach */}
          <div className="flex flex-col-reverse lg:grid lg:grid-cols-3 gap-6 lg:gap-10">
            {/* Main Content Column - Takes up 2/3 on large screens */}
            <div className="lg:col-span-2 space-y-4 sm:space-y-6">
              {/* Featured Image - Full width at top of content */}
              {featuredImage && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="mb-6 sm:mb-8"
                >
                  <div className="relative group">
                    <motion.div
                      style={{ y: imageY }}
                      className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm"
                    >
                      <div className="relative aspect-[16/10] sm:aspect-[16/9] w-full">
                        <OptimizedCardImage
                          src={featuredImage}
                          alt={`Preview of ${bookmark.title}`}
                          priority
                          className="!transition-none"
                        />
                        {/* Hover overlay */}
                        <a
                          href={safeUrl ?? "/bookmarks"}
                          target={safeUrl ? "_blank" : undefined}
                          rel={safeUrl ? "noopener noreferrer" : undefined}
                          className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-center justify-center"
                          aria-label={`View ${bookmark.title} on ${domain}`}
                        >
                          <div className="absolute top-4 right-4 p-2 bg-white/90 dark:bg-black/90 backdrop-blur-sm rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                            <ArrowUpRight className="w-5 h-5" />
                          </div>
                        </a>
                      </div>
                    </motion.div>
                    {/* Author and Publisher info under image */}
                    {(bookmark.content?.author || bookmark.content?.publisher) && (
                      <div className="mt-1 pl-2">
                        <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                          {bookmark.content?.author && (
                            <>
                              <User className="w-3.5 h-3.5" />
                              <span>{bookmark.content.author}</span>
                            </>
                          )}
                          {bookmark.content?.publisher && (
                            <span className="text-gray-500 dark:text-gray-400">
                              {bookmark.content?.author ? " · " : ""}via {bookmark.content.publisher}
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Summary Box - Uses AI-generated summary with proper formatting, falls back to description */}
              {(bookmark.summary || bookmark.description) && (
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: 0.5 }}
                  className="p-4 sm:p-5 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 sm:mb-3">
                    Summary
                  </h2>
                  <div className="text-sm sm:text-base leading-relaxed text-gray-700 dark:text-gray-300 space-y-3">
                    {(() => {
                      // Use shared utilities for consistent formatting
                      const paragraphs = bookmark.summary
                        ? processSummaryText(removeCitations(bookmark.summary)).split("\n\n")
                        : [bookmark.description || ""];
                      return paragraphs.map((p, i) => <p key={`${bookmark.id}-p-${i}`}>{p}</p>);
                    })()}
                  </div>
                </motion.section>
              )}

              {/* Personal Notes */}
              {bookmark.note && (
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.5 }}
                  className="p-4 sm:p-5 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800"
                >
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-2 sm:mb-3 flex items-center gap-2">
                    <BookOpen className="w-4 h-4" />
                    Personal Notes
                  </h2>
                  <div className="relative pl-4">
                    <Quote className="absolute -left-1 -top-1 w-5 h-5 text-amber-500/30 dark:text-amber-400/20 rotate-180" />
                    <p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap text-blue-900 dark:text-blue-100">
                      {bookmark.note}
                    </p>
                  </div>
                </motion.section>
              )}

              {/* If no content is available, show a placeholder */}
              {!bookmark.description && !bookmark.note && !featuredImage && (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <Bookmark className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>No additional details available for this bookmark.</p>
                  <p className="text-sm mt-2">Visit the original site to explore the content.</p>
                </div>
              )}

              {/* AI Analysis - Full width in main content for rich output */}
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
              >
                <BookmarkAiAnalysis bookmark={bookmark} />
              </motion.section>
            </div>

            {/* Sidebar Column - Shows first on mobile, 1/3 on large screens */}
            <div className="space-y-4 lg:space-y-6">
              {/* Tags */}
              {bookmark.tags && bookmark.tags.length > 0 && (
                <motion.section
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4, duration: 0.5 }}
                >
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 sm:mb-3">
                    Topics
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {bookmark.tags.map(tag => {
                      const isString = typeof tag === "string";
                      const tagName = isString ? tag : (tag as BookmarkTag).name;
                      const tagSlug = isString
                        ? tagToSlug(tagName)
                        : (tag as BookmarkTag).slug?.trim() || tagToSlug(tagName);
                      const tagKey = isString ? tag : (tag as BookmarkTag).id;
                      return (
                        <Link
                          key={tagKey}
                          href={`/bookmarks/tags/${tagSlug}`}
                          className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md text-xs transition-colors"
                        >
                          {tagName}
                        </Link>
                      );
                    })}
                  </div>
                </motion.section>
              )}

              {/* Metadata Card - Only show if there's a valid date */}
              {updatedDate && (
                <motion.section
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5, duration: 0.5 }}
                  className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2 sm:space-y-3"
                >
                  {/* Hide header on mobile, show on desktop */}
                  <h2 className="hidden sm:block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                    Details
                  </h2>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Updated</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100" suppressHydrationWarning>
                      {updatedDate}
                    </span>
                  </div>
                </motion.section>
              )}

              {/* Action Buttons */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6, duration: 0.5 }}
                className="space-y-2 sm:space-y-3"
              >
                <a
                  href={safeUrl ?? "/bookmarks"}
                  target={safeUrl ? "_blank" : undefined}
                  rel={safeUrl ? "noopener noreferrer" : undefined}
                  className={`flex items-center justify-center gap-2 w-full px-5 py-3 sm:py-2.5 font-medium rounded-lg transition-colors group ${
                    isGitHub
                      ? "bg-[#24292f] dark:bg-[#f0f3f6] text-white dark:text-[#24292f] hover:bg-[#32383f] dark:hover:bg-[#d8dee4]"
                      : "bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100"
                  }`}
                >
                  {isGitHub ? <Github className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                  <span>{isGitHub ? "View on GitHub" : "Visit Site"}</span>
                  <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </a>

                {/* Registry Links (npm, PyPI, etc.) */}
                <RegistryLinks links={bookmark.registryLinks} />

                <Link
                  href="/bookmarks"
                  className="flex items-center justify-center gap-2 w-full px-5 py-3 sm:py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <Bookmark className="w-4 h-4" />
                  <span>All Bookmarks</span>
                </Link>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </BookmarksWindow>
  );
}
