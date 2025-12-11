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
} from "lucide-react";
import type { BookFormat } from "@/types/schemas/book";
import type { BookDetailProps } from "@/types/features/books";
import { BooksWindow } from "./books-window.client";
import { cn } from "@/lib/utils";
import { processSummaryText } from "@/lib/utils/formatters";

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
  }
  return `${minutes} min`;
}

function FormatBadge({ format, large = false }: { format: BookFormat; large?: boolean }) {
  const config: Record<BookFormat, { icon: typeof Headphones; label: string; className: string }> = {
    audio: {
      icon: Headphones,
      label: "Audiobook",
      className:
        "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border-violet-200 dark:border-violet-800",
    },
    ebook: {
      icon: BookText,
      label: "eBook",
      className:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    },
    print: {
      icon: BookText,
      label: "Print",
      className:
        "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    },
  };

  const { icon: Icon, label, className } = config[format];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border rounded-full font-medium",
        large ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs",
        className,
      )}
    >
      <Icon className={large ? "w-4 h-4" : "w-3.5 h-3.5"} />
      {label}
    </span>
  );
}

function ExternalLinkButton({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <a
      href={href}
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
          {/* Library Context */}
          <div className="mb-4">
            <Link
              href="/books"
              className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 inline-flex items-center gap-1.5 transition-colors"
            >
              <Library className="w-3.5 h-3.5" />
              <span>William&apos;s Reading List</span>
            </Link>
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
                    quality={80}
                    className="object-cover"
                    priority
                    placeholder={book.coverBlurDataURL ? "blur" : "empty"}
                    blurDataURL={book.coverBlurDataURL}
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center">
                    <BookOpen className="w-20 h-20 text-gray-400 dark:text-gray-500" />
                  </div>
                )}
              </div>

              {/* Format Badges under cover on mobile */}
              <div className="flex flex-wrap justify-center gap-2 mt-4 lg:hidden">
                {book.formats?.map(format => (
                  <FormatBadge key={format} format={format} large />
                ))}
              </div>
            </motion.div>

            {/* Details Column */}
            <div className="lg:col-span-2 space-y-6">
              {/* Header */}
              <motion.div initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                {/* Format Badges - Desktop only */}
                <div className="hidden lg:flex flex-wrap gap-2 mb-3">
                  {book.formats?.map(format => (
                    <FormatBadge key={format} format={format} large />
                  ))}
                </div>

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

              {/* Metadata Grid */}
              <motion.div
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700"
              >
                {book.publisher && (
                  <div className="flex items-start gap-2.5">
                    <Building2 className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Publisher</p>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{book.publisher}</p>
                    </div>
                  </div>
                )}

                {book.publishedYear && (
                  <div className="flex items-start gap-2.5">
                    <Calendar className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Published</p>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{book.publishedYear}</p>
                    </div>
                  </div>
                )}

                {hasAudio && book.audioDurationSeconds && (
                  <div className="flex items-start gap-2.5">
                    <Headphones className="w-4 h-4 text-gray-400 mt-0.5" />
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
                    <Headphones className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Narrated by</p>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        {book.audioNarrators.join(", ")}
                      </p>
                    </div>
                  </div>
                )}

                {(book.isbn13 || book.isbn10) && (
                  <div className="flex items-start gap-2.5">
                    <Hash className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">ISBN</p>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 font-mono">
                        {book.isbn13 || book.isbn10}
                      </p>
                    </div>
                  </div>
                )}

                {book.asin && (
                  <div className="flex items-start gap-2.5">
                    <Hash className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">ASIN</p>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 font-mono">{book.asin}</p>
                    </div>
                  </div>
                )}
              </motion.div>

              {/* Genres */}
              {book.genres && book.genres.length > 0 && (
                <motion.div initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Genres
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {book.genres.map(genre => (
                      <span
                        key={genre}
                        className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md text-sm"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                </motion.div>
              )}

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

              {/* Back to Library */}
              <motion.div initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                <Link
                  href="/books"
                  className={cn(
                    "inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3",
                    "bg-gray-900 dark:bg-white text-white dark:text-gray-900",
                    "font-medium rounded-lg",
                    "hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors",
                  )}
                >
                  <Library className="w-4 h-4" />
                  <span>Back to Reading List</span>
                </Link>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </BooksWindow>
  );
}
