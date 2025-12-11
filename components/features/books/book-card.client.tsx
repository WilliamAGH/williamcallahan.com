/**
 * Book Card Client Component
 * @module components/features/books/book-card.client
 * @description
 * Displays individual book entries in a visually striking card format.
 * Features book cover, metadata, and format indicators.
 */

"use client";

import Link from "next/link";
import Image from "next/image";
import { BookText, User, Headphones } from "lucide-react";
import type { BookListItem, Book } from "@/types/schemas/book";
import type { BookCardProps } from "@/types/features/books";
import { generateBookSlug } from "@/lib/books/slug-helpers";
import { cn } from "@/lib/utils";

export function BookCard({ book, priority = false }: BookCardProps) {
  const slug = generateBookSlug(book.title, book.id);
  const href = `/books/${slug}`;

  // Type guard to check if we have full Book data
  const isFullBook = (b: BookListItem | Book): b is Book => "formats" in b;
  const fullBook = isFullBook(book) ? book : null;

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex flex-col bg-white/60 dark:bg-gray-900/60 backdrop-blur-md",
        "rounded-2xl overflow-hidden",
        "border border-gray-200/60 dark:border-gray-700/60",
        "shadow-sm hover:shadow-xl",
        "transform transition-all duration-300 ease-out",
        "hover:scale-[1.02] hover:-translate-y-1",
      )}
    >
      {/* Cover Image Section */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900">
        {book.coverUrl ? (
          <Image
            src={book.coverUrl}
            alt={`Cover of ${book.title}`}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            priority={priority}
          />
        ) : (
          // Placeholder when no cover
          <div className="absolute inset-0 flex items-center justify-center">
            <BookText className="w-16 h-16 text-gray-300 dark:text-gray-600" />
          </div>
        )}

        {/* Gradient overlay for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      {/* Content Section - Fixed height for consistent card sizing */}
      <div className="p-4 flex flex-col gap-2 h-[132px]">
        {/* Title - Fixed 2-line container */}
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug min-h-[2.75rem] group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          {book.title}
        </h3>

        {/* Authors - Fixed 3-line max container with ellipsis */}
        <div className="min-h-[3.75rem] flex items-start">
          {book.authors && book.authors.length > 0 ? (
            <p className="flex items-start gap-1.5 text-sm text-gray-600 dark:text-gray-400">
              <User className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span className="line-clamp-3">{book.authors.join(", ")}</span>
            </p>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-600 italic">Unknown author</p>
          )}
        </div>

        {/* Narrators for audiobooks - Fixed single line */}
        <div className="h-4 flex items-center">
          {fullBook?.audioNarrators && fullBook.audioNarrators.length > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-500 line-clamp-1">
              <Headphones className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">Narrated by {fullBook.audioNarrators.join(", ")}</span>
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
