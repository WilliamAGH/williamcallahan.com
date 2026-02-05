/**
 * Book Card Client Component
 * @module components/features/books/book-card.client
 * @description
 * Displays individual book entries in a visually striking card format.
 * Features book cover, metadata, and format indicators.
 */

"use client";

import Link from "next/link";
import { BookText, User, Headphones } from "lucide-react";
import type { BookListItem, Book } from "@/types/schemas/book";
import type { BookCardProps } from "@/types/features/books";
import { generateBookSlug } from "@/lib/books/slug-helpers";
import { cn } from "@/lib/utils";
import { OptimizedCardImage } from "@/components/ui/logo-image.client";

export function BookCard({ book, priority = false }: BookCardProps): React.JSX.Element {
  // Type guard to check if we have full Book data (for ISBN access)
  const isFullBook = (b: BookListItem | Book): b is Book => "formats" in b;
  const fullBook = isFullBook(book) ? book : null;

  const slug = generateBookSlug(
    book.title,
    book.id,
    book.authors,
    fullBook?.isbn13,
    fullBook?.isbn10,
  );
  const href = `/books/${slug}`;

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex flex-col",
        "rounded-xl overflow-hidden",
        "bg-white dark:bg-gray-900/80",
        "border border-gray-200/80 dark:border-gray-700/50",
        "shadow-sm hover:shadow-lg",
        "ring-1 ring-transparent hover:ring-gray-200 dark:hover:ring-gray-600",
        "transform transition-all duration-300 ease-out",
        "hover:-translate-y-1",
      )}
    >
      {/* Cover Image Section - aspect-[2/3] is standard book cover ratio */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900">
        {book.coverUrl ? (
          <OptimizedCardImage
            src={book.coverUrl}
            alt={`Cover of ${book.title}`}
            className="transition-transform duration-500 group-hover:scale-[1.03]"
            preload={priority}
            blurDataURL={book.coverBlurDataURL}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <BookText className="w-12 h-12 text-gray-300 dark:text-gray-600" />
          </div>
        )}

        {/* Subtle gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      {/* Content Section - Refined spacing for 4-column layout */}
      <div className="p-4 flex flex-col flex-1 min-h-[120px]">
        {/* Title - 3 lines to avoid cutoff on longer titles */}
        <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100 line-clamp-3 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          {book.title}
        </h3>

        {/* Authors - 2 lines max, subtle styling */}
        <div className="mt-2 flex-1 flex items-start">
          {book.authors && book.authors.length > 0 ? (
            <p className="flex items-start gap-1.5 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              <User className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0 mt-0.5" />
              <span className="line-clamp-2">{book.authors.join(", ")}</span>
            </p>
          ) : (
            <p className="text-xs sm:text-sm text-gray-400 dark:text-gray-500 italic">
              Unknown author
            </p>
          )}
        </div>

        {/* Narrators for audiobooks - Compact display */}
        {fullBook?.audioNarrators && fullBook.audioNarrators.length > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 line-clamp-1">
            <Headphones className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{fullBook.audioNarrators.join(", ")}</span>
          </p>
        )}
      </div>
    </Link>
  );
}
