/**
 * Book Analysis Context Extractor
 * @module lib/books/analysis/extract-context
 * @description
 * Extracts relevant context from a book for LLM prompt construction.
 */

import type { Book } from "@/types/schemas/book";
import type { BookAnalysisContext } from "@/types/book-ai-analysis";

/**
 * Extract analysis-relevant context from a book.
 * Normalizes optional fields and prepares data for prompt construction.
 *
 * @param book - The book to extract context from
 * @returns Normalized context object for prompt building
 */
export function extractBookAnalysisContext(book: Book): BookAnalysisContext {
  return {
    title: book.title,
    subtitle: book.subtitle ?? null,
    authors: book.authors ?? [],
    description: book.description ?? null,
    genres: book.genres ?? [],
    publisher: book.publisher ?? null,
    publishedYear: book.publishedYear ?? null,
    narrators: book.audioNarrators ?? [],
    existingSummary: book.aiSummary ?? null,
    thoughts: book.thoughts ?? null,
  };
}
