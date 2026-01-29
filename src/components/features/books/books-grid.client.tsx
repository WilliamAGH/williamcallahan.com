/**
 * Books Grid Client Component
 * @module components/features/books/books-grid.client
 * @description
 * Client component that renders the books grid with window wrapper.
 * Handles client-side interactivity and animations.
 */

"use client";

import { motion } from "framer-motion";
import { BookOpen, AlertCircle } from "lucide-react";
import type { BooksClientGridProps } from "@/types/features/books";
import { BooksWindow } from "./books-window.client";
import { BookCard } from "./book-card.client";

export function BooksClientGrid({
  books,
  title,
  description,
  disclaimer,
  error,
  isStale,
}: BooksClientGridProps) {
  return (
    <BooksWindow windowTitle="~/books">
      <div className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <motion.div
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-8"
          >
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-3">
              {title}
            </h1>
            <p className="text-base sm:text-lg text-gray-600 dark:text-gray-400">{description}</p>
            {books.length > 0 && (
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
                {books.length} {books.length === 1 ? "book" : "books"} in collection
              </p>
            )}
          </motion.div>

          {/* Disclaimer - Editorial margin note style */}
          {disclaimer && (
            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="mb-8 pl-4 border-l-2 border-gray-300 dark:border-gray-600"
            >
              <p className="text-sm text-gray-600 dark:text-gray-400 italic leading-relaxed">
                {disclaimer}
              </p>
            </motion.div>
          )}

          {/* Error State */}
          {error && (
            <motion.div
              initial={false}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 mb-8"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p>{error}</p>
            </motion.div>
          )}

          {/* Stale notice */}
          {!error && isStale && (
            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="mb-8 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
            >
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <p className="text-sm">
                Showing cached book data while the library refreshes. A live update will appear once
                the source is back online.
              </p>
            </motion.div>
          )}

          {/* Empty State */}
          {!error && books.length === 0 && (
            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="text-center py-16"
            >
              <BookOpen className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
              <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
                No books yet
              </h2>
              <p className="text-gray-500 dark:text-gray-400">
                Books will appear here once they&apos;re added to the library.
              </p>
            </motion.div>
          )}

          {/* Books Grid - 4 columns max for proper title legibility */}
          {books.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5 sm:gap-6 lg:gap-8">
              {books.map((book, index) => (
                <BookCard key={book.id} book={book} priority={index < 8} />
              ))}
            </div>
          )}
        </div>
      </div>
    </BooksWindow>
  );
}
