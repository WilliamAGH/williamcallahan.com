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
} from "lucide-react";
import Image from "next/image";
import { selectBestImage } from "@/lib/bookmarks/bookmark-helpers";
import { BookmarksWindow } from "./bookmarks-window.client";

// Hoisted helper to satisfy consistent-function-scoping without behavior change
const formatDate = (dateString: string | null | undefined): string | null => {
  if (!dateString) return null;
  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return null;
  }
};

export function BookmarkDetail({ bookmark }: { bookmark: UnifiedBookmark }) {
  const [mounted, setMounted] = useState(false);
  const { scrollY } = useScroll();

  // Subtle parallax for image
  const imageY = useTransform(scrollY, [0, 300], [0, -20]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Extract domain for display
  const domain = useMemo(() => {
    try {
      const url = new URL(bookmark.url.startsWith("http") ? bookmark.url : `https://${bookmark.url}`);
      return url.hostname.replace(/^www\./, "");
    } catch {
      return "website";
    }
  }, [bookmark.url]);

  // Sanitize URL to prevent XSS attacks (only allow http/https protocols)
  const safeUrl = useMemo(() => {
    try {
      const normalized = bookmark.url.startsWith("http") ? bookmark.url : `https://${bookmark.url}`;
      const u = new URL(normalized);
      return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
    } catch {
      return null;
    }
  }, [bookmark.url]);

  // Calculate reading time display
  const readingTimeDisplay = useMemo(() => {
    if (!bookmark.readingTime) return null;
    const minutes = Math.ceil(bookmark.readingTime);
    return `${minutes} min`;
  }, [bookmark.readingTime]);

  const publishedDate = formatDate(bookmark.content?.datePublished || bookmark.datePublished);
  const bookmarkedDate = formatDate(bookmark.dateBookmarked);

  // Get best image for display
  const featuredImage = selectBestImage(bookmark, {
    includeScreenshots: true,
  });

  if (!mounted) return null;

  return (
    <BookmarksWindow windowTitle="~/bookmarks" windowId={`bookmark-detail-${bookmark.id}`}>
      <div className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Library Context - Subtle ownership indicator */}
          <div className="mb-3 sm:mb-4">
            <Link
              href="/bookmarks"
              className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 inline-flex items-center gap-1.5 transition-colors"
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>William&apos;s Bookmark Library</span>
            </Link>
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
                  <span className="hidden sm:inline">Saved {bookmarkedDate}</span>
                  <span className="sm:hidden">Saved {bookmarkedDate}</span>
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
                  {publishedDate}
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
                        <Image
                          src={featuredImage}
                          alt={`Preview of ${bookmark.title}`}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 66vw, 800px"
                          priority
                          unoptimized
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
                  {bookmark.summary ? (
                    <div className="text-sm sm:text-base leading-relaxed text-gray-700 dark:text-gray-300 space-y-3">
                      {bookmark.summary.split("\n\n").map((paragraph, index) => (
                        <p key={`${bookmark.id}-p-${index}`}>{paragraph}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm sm:text-base leading-relaxed text-gray-700 dark:text-gray-300">
                      {bookmark.description}
                    </p>
                  )}
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
                  <p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap text-blue-900 dark:text-blue-100">
                    {bookmark.note}
                  </p>
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
                        ? tag.toLowerCase().replace(/\s+/g, "-")
                        : ((tag as BookmarkTag).slug ?? "");
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

              {/* Metadata Card - Only show if there's content */}
              {bookmark.dateUpdated && (
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

                  {bookmark.dateUpdated && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Updated</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {formatDate(bookmark.dateUpdated)}
                      </span>
                    </div>
                  )}
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
                  className="flex items-center justify-center gap-2 w-full px-5 py-3 sm:py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors group"
                >
                  <span>Visit Site</span>
                  <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </a>

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
