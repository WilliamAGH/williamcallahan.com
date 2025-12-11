/**
 * Books Grid Client Component
 * @module components/features/books/books-grid.client
 * @description
 * Client component that renders the books grid with window wrapper.
 * Handles client-side interactivity and animations.
 */

"use client";

import { motion } from "framer-motion";
import { BookOpen, AlertCircle, Sparkles } from "lucide-react";
import type { BooksClientGridProps } from "@/types/features/books";
import { BooksWindow } from "./books-window.client";
import { BookCard } from "./book-card.client";

export function BooksClientGrid({ books, title, description, disclaimer, error }: BooksClientGridProps) {
  return (
    <BooksWindow windowTitle="~/books">
      <div className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <motion.div initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-3">{title}</h1>
            <p className="text-base sm:text-lg text-gray-600 dark:text-gray-400">{description}</p>
            {books.length > 0 && (
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
                {books.length} {books.length === 1 ? "book" : "books"} in collection
              </p>
            )}
          </motion.div>

          {/* Disclaimer */}
          {disclaimer && (
            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="mb-8 flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl"
            >
              <div className="flex-shrink-0 mt-0.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 text-[10px] font-semibold uppercase tracking-wider">
                  <Sparkles className="w-3 h-3" />
                  New Feature
                </span>
              </div>
              <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">{disclaimer}</p>
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

          {/* Empty State */}
          {!error && books.length === 0 && (
            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="text-center py-16"
            >
              <BookOpen className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
              <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">No books yet</h2>
              <p className="text-gray-500 dark:text-gray-400">
                Books will appear here once they&apos;re added to the library.
              </p>
            </motion.div>
          )}

          {/* Books Grid */}
          {books.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
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
