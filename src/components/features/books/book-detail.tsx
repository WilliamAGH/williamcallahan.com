/**
 * Book Detail Component
 * @module components/features/books/book-detail
 * @description
 * Displays comprehensive book information in a stunning detail view.
 * Features cover art, metadata, AI summary, and personal thoughts.
 */

"use client";

import { useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  BookOpen,
  Headphones,
  BookText,
  User,
  Calendar,
  Building2,
  Hash,
  ExternalLink,
  ArrowUpRight,
  Sparkles,
  MessageSquareQuote,
  Library,
  Tag,
  ChevronLeft,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import type { BookDetailProps } from "@/types/features/books";
import { BooksWindow } from "./books-window.client";
import { cn } from "@/lib/utils";
import { processSummaryText } from "@/lib/utils/formatters";
import { TerminalContext } from "@/components/ui/context-notes/terminal-context.client";

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
  }
  return `${minutes} min`;
}

function ExternalLinkButton({ href, label, icon: Icon }: { href: string; label: string; icon: LucideIcon }) {
  const safeHref = (() => {
    try {
      const url = new URL(href);
      return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
    } catch {
      return null;
    }
  })();

  if (!safeHref) return null;

  return (
    <a
      href={safeHref}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-2 px-4 py-2.5",
        "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700",
        "text-sm font-medium text-gray-700 dark:text-gray-200",
        "rounded-lg border border-gray-200 dark:border-gray-700",
        "transition-colors group",
      )}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
      <ArrowUpRight className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
    </a>
  );
}

export function BookDetail({ book }: BookDetailProps) {
  const hasAudio = book.formats?.includes("audio");
  const hasExternalLinks = book.amazonUrl || book.audibleUrl || book.bookshopUrl || book.findMyBookUrl;

  // Process AI summary into paragraphs
  const summaryParagraphs = useMemo(() => {
    if (!book.aiSummary) return [];
    return processSummaryText(book.aiSummary).split("\n\n");
  }, [book.aiSummary]);

  return (
    <BooksWindow windowTitle="~/books" windowId={`book-detail-${book.id}`}>
      <div className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Library Navigation */}
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link
              href="/books"
              className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 inline-flex items-center gap-1 transition-colors group"
            >
              <ChevronLeft className="w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors -ml-1" />
              <Library className="w-3.5 h-3.5" />
              <span>William&apos;s Reading List</span>
            </Link>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <TerminalContext type="book" />
          </div>

          {/* Main Content Grid */}
          <div className="flex flex-col lg:grid lg:grid-cols-3 gap-8 lg:gap-10">
            {/* Cover Column */}
            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="lg:col-span-1"
            >
              {/* aspect-[4/5] matches typical tech book covers (~0.80 ratio) */}
              <div className="relative aspect-[4/5] w-full max-w-xs mx-auto lg:max-w-none overflow-hidden rounded-xl shadow-2xl">
                {book.coverUrl ? (
                  <Image
                    src={book.coverUrl}
                    alt={`Cover of ${book.title}`}
                    fill
                    sizes="(max-width: 1024px) 320px, 280px"
                    className="object-cover"
                    priority
                    placeholder={book.coverBlurDataURL ? "blur" : "empty"}
                    blurDataURL={book.coverBlurDataURL}
                    unoptimized
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center">
                    <BookOpen className="w-20 h-20 text-gray-400 dark:text-gray-500" />
                  </div>
                )}
              </div>
            </motion.div>

            {/* Details Column */}
            <div className="lg:col-span-2 space-y-6">
              {/* Header */}
              <motion.div initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                {/* Title */}
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
                  {book.title}
                </h1>

                {/* Subtitle */}
                {book.subtitle && <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">{book.subtitle}</p>}

                {/* Authors */}
                {book.authors && book.authors.length > 0 && (
                  <p className="mt-3 flex items-center gap-2 text-base text-gray-700 dark:text-gray-300">
                    <User className="w-4 h-4 text-gray-500" />
                    <span className="font-medium">{book.authors.join(", ")}</span>
                  </p>
                )}
              </motion.div>

              {/* Collapsible Book Metadata - Secondary catalog details */}
              <details className="group border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <summary
                  className={cn(
                    "flex items-center justify-between gap-2 px-4 py-3 cursor-pointer select-none",
                    "bg-gray-50 dark:bg-gray-800/50",
                    "text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400",
                    "hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors",
                    "[&::-webkit-details-marker]:hidden",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Hash className="w-3.5 h-3.5" />
                    Book Metadata
                  </span>
                  <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                </summary>

                <div className="p-4 bg-white dark:bg-gray-900/50 space-y-4">
                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    {book.publisher && (
                      <div className="flex items-start gap-2.5">
                        <Building2 className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Publisher</p>
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 break-words">
                            {book.publisher}
                          </p>
                        </div>
                      </div>
                    )}

                    {book.publishedYear && (
                      <div className="flex items-start gap-2.5">
                        <Calendar className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Published</p>
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{book.publishedYear}</p>
                        </div>
                      </div>
                    )}

                    {hasAudio && book.audioDurationSeconds && (
                      <div className="flex items-start gap-2.5">
                        <Headphones className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Duration</p>
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                            {formatDuration(book.audioDurationSeconds)}
                          </p>
                        </div>
                      </div>
                    )}

                    {hasAudio && book.audioNarrators && book.audioNarrators.length > 0 && (
                      <div className="flex items-start gap-2.5">
                        <Headphones className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Narrated by
                          </p>
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 break-words">
                            {book.audioNarrators.join(", ")}
                          </p>
                        </div>
                      </div>
                    )}

                    {(book.isbn13 || book.isbn10) && (
                      <div className="flex items-start gap-2.5">
                        <Hash className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">ISBN</p>
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 font-mono text-xs">
                            {book.isbn13 || book.isbn10}
                          </p>
                        </div>
                      </div>
                    )}

                    {book.asin && (
                      <div className="flex items-start gap-2.5">
                        <Hash className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">ASIN</p>
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 font-mono text-xs">
                            {book.asin}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Genres */}
                  {book.genres && book.genres.length > 0 && (
                    <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
                      <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5" />
                        Genres
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {book.genres.map(genre => (
                          <span
                            key={genre}
                            className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded text-xs"
                          >
                            {genre}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </details>

              {/* Description */}
              {book.description && (
                <motion.section
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="p-5 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700"
                >
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">
                    <BookOpen className="w-4 h-4" />
                    About This Book
                  </h2>
                  <p className="text-sm sm:text-base leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-line">
                    {book.description}
                  </p>
                </motion.section>
              )}

              {/* AI Summary */}
              {book.aiSummary && summaryParagraphs.length > 0 && (
                <motion.section
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="p-5 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800"
                >
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    AI Summary
                  </h2>
                  <div className="text-sm sm:text-base leading-relaxed text-indigo-900 dark:text-indigo-100 space-y-3">
                    {summaryParagraphs.map((p, i) => (
                      <p key={`summary-${book.id}-${i}`}>{p}</p>
                    ))}
                  </div>
                </motion.section>
              )}

              {/* Personal Thoughts */}
              {book.thoughts && (
                <motion.section
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="p-5 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl border border-amber-200 dark:border-amber-800"
                >
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-3 flex items-center gap-2">
                    <MessageSquareQuote className="w-4 h-4" />
                    My Thoughts
                  </h2>
                  <p className="text-sm sm:text-base leading-relaxed text-amber-900 dark:text-amber-100 whitespace-pre-line">
                    {book.thoughts}
                  </p>
                </motion.section>
              )}

              {/* External Links */}
              {hasExternalLinks && (
                <motion.div
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-wrap gap-3"
                >
                  {book.amazonUrl && <ExternalLinkButton href={book.amazonUrl} label="Amazon" icon={ExternalLink} />}
                  {book.audibleUrl && <ExternalLinkButton href={book.audibleUrl} label="Audible" icon={Headphones} />}
                  {book.bookshopUrl && <ExternalLinkButton href={book.bookshopUrl} label="Bookshop" icon={BookText} />}
                  {book.findMyBookUrl && (
                    <ExternalLinkButton href={book.findMyBookUrl} label="Find My Book" icon={ExternalLink} />
                  )}
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </div>
    </BooksWindow>
  );
}
