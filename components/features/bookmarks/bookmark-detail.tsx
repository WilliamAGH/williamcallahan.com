"use client";

import { useMemo, useEffect, useState } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import type { UnifiedBookmark } from "@/types";
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
  Library
} from "lucide-react";
import Image from "next/image";
import type { BookmarkTag } from "@/types";
import { selectBestImage } from "@/lib/bookmarks/bookmark-helpers";
import { BookmarksWindow } from "./bookmarks-window.client";

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

  // Calculate reading time display
  const readingTimeDisplay = useMemo(() => {
    if (!bookmark.readingTime) return null;
    const minutes = Math.ceil(bookmark.readingTime);
    return `${minutes} min`;
  }, [bookmark.readingTime]);

  // Format dates
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return null;
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric"
      });
    } catch {
      return null;
    }
  };

  const publishedDate = formatDate(bookmark.content?.datePublished || bookmark.datePublished);
  const bookmarkedDate = formatDate(bookmark.dateBookmarked);

  // Get best image for display
  const featuredImage = selectBestImage(bookmark, {
    includeScreenshots: true,
  });

  if (!mounted) return null;

  return (
    <BookmarksWindow 
        windowTitle="~/bookmarks"
        windowId={`bookmark-detail-${bookmark.id}`}
      >
        <div className="w-full mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            
            {/* Personal Context Badge */}
            <div className="mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-sm">
                <Library className="w-3.5 h-3.5" />
                <span>From my bookmarks collection</span>
                {bookmarkedDate && (
                  <>
                    <span className="text-blue-400 dark:text-blue-500">•</span>
                    <span className="text-blue-600 dark:text-blue-400">Saved {bookmarkedDate}</span>
                  </>
                )}
              </div>
            </div>

            {/* Header Section */}
            <div className="mb-8">
              {/* Status Badges */}
              {(bookmark.archived || bookmark.isFavorite) && (
                <div className="flex gap-2 mb-4">
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

              {/* Title - Clickable to external site */}
              <h1 className="text-2xl md:text-3xl font-bold mb-4 leading-tight">
                <a 
                  href={bookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-900 dark:text-gray-100 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                >
                  {bookmark.title}
                </a>
              </h1>

              {/* Metadata Row */}
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                {/* Domain Pill with External Link */}
                <a
                  href={bookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors group"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span className="font-medium">{domain}</span>
                  <ExternalLink className="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity" />
                </a>

                {bookmark.content?.author && (
                  <>
                    <span className="text-gray-400 dark:text-gray-600">•</span>
                    <span className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      {bookmark.content.author}
                    </span>
                  </>
                )}

                {readingTimeDisplay && (
                  <>
                    <span className="text-gray-400 dark:text-gray-600">•</span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {readingTimeDisplay}
                    </span>
                  </>
                )}

                {publishedDate && (
                  <>
                    <span className="text-gray-400 dark:text-gray-600">•</span>
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {publishedDate}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-10">
              
              {/* Main Content Column - Takes up 2/3 on large screens */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* Featured Image - Full width at top of content */}
                {featuredImage && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="mb-8"
                  >
                    <div className="relative group">
                      <motion.div
                        style={{ y: imageY }}
                        className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm"
                      >
                        <div className="relative aspect-[16/9] w-full">
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
                            href={bookmark.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-center justify-center"
                            aria-label={`View ${bookmark.title} on ${domain}`}
                          >
                            <div className="absolute top-4 right-4 p-2 bg-white/90 dark:bg-black/90 backdrop-blur-sm rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                              <ArrowUpRight className="w-5 h-5" />
                            </div>
                          </a>
                        </div>
                      </motion.div>
                      {bookmark.content?.publisher && (
                        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                          via {bookmark.content.publisher}
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
                
                {/* Description - Integrated at top */}
                {bookmark.description && (
                  <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.5 }}
                    className="prose prose-gray dark:prose-invert max-w-none"
                  >
                    <p className="text-lg leading-relaxed text-gray-700 dark:text-gray-300 mb-0">
                      {bookmark.description}
                    </p>
                  </motion.section>
                )}

                {/* AI Summary */}
                {bookmark.summary && (
                  <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                    className="p-5 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700"
                  >
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
                      Summary
                    </h2>
                    <p className="text-base leading-relaxed text-gray-700 dark:text-gray-300">
                      {bookmark.summary}
                    </p>
                  </motion.section>
                )}

                {/* Personal Notes */}
                {bookmark.note && (
                  <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                    className="p-5 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800"
                  >
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-3 flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      Personal Notes
                    </h2>
                    <p className="text-base leading-relaxed whitespace-pre-wrap text-blue-900 dark:text-blue-100">
                      {bookmark.note}
                    </p>
                  </motion.section>
                )}

                {/* If no content is available, show a placeholder */}
                {!bookmark.description && !bookmark.summary && !bookmark.note && !featuredImage && (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <Bookmark className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>No additional details available for this bookmark.</p>
                    <p className="text-sm mt-2">Visit the original site to explore the content.</p>
                  </div>
                )}
              </div>

              {/* Sidebar Column - Takes up 1/3 on large screens */}
              <div className="space-y-6">
                
                {/* Tags */}
                {bookmark.tags && bookmark.tags.length > 0 && (
                  <motion.section
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4, duration: 0.5 }}
                  >
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
                      Topics
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      {bookmark.tags.map((tag) => {
                        const isString = typeof tag === "string";
                        const tagName = isString ? tag : (tag as BookmarkTag).name;
                        const tagSlug = isString ? tag.toLowerCase().replace(/\s+/g, "-") : (tag as BookmarkTag).slug ?? "";
                        const tagKey = isString ? tag : (tag as BookmarkTag).id;
                        return (
                          <Link
                            key={tagKey}
                            href={`/bookmarks/tags/${tagSlug}`}
                            className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md text-xs transition-colors"
                          >
                            {tagName}
                          </Link>
                        );
                      })}
                    </div>
                  </motion.section>
                )}

                {/* Metadata Card */}
                <motion.section
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5, duration: 0.5 }}
                  className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3"
                >
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Details
                  </h2>
                  
                  {bookmark.wordCount && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Words</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{bookmark.wordCount.toLocaleString()}</span>
                    </div>
                  )}
                  
                  {bookmark.dateUpdated && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Updated</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{formatDate(bookmark.dateUpdated)}</span>
                    </div>
                  )}
                </motion.section>

                {/* Action Buttons */}
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6, duration: 0.5 }}
                  className="space-y-3"
                >
                  <a
                    href={bookmark.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors group"
                  >
                    <span>Visit Site</span>
                    <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </a>

                  <Link
                    href="/bookmarks"
                    className="flex items-center justify-center gap-2 w-full px-5 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
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