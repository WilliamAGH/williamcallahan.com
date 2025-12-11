/**
 * Books Feature Component Props
 * @module types/features/books
 * @description
 * Type definitions for books feature components.
 * Following the established pattern from bookmarks feature types.
 */

import type { Book, BookListItem } from "@/types/schemas/book";

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Minimal book fields required for slug generation
 * Used by lib/books/slug-helpers.ts for type-safe slug operations
 */
export type BookSlugInput = Pick<Book, "id" | "title" | "authors" | "isbn13" | "isbn10">;

// =============================================================================
// PAGE PROPS (Next.js App Router)
// =============================================================================

/**
 * Props for the book detail page route
 * Used in app/books/[book-slug]/page.tsx
 */
export interface BookPageProps {
  params: Promise<{ "book-slug": string }>;
}

// =============================================================================
// CLIENT COMPONENT PROPS
// =============================================================================

/**
 * Props for the BookCard client component
 * Used in components/features/books/book-card.client.tsx
 */
export interface BookCardProps {
  book: BookListItem | Book;
  priority?: boolean;
}

/**
 * Props for the BookDetail client component
 * Used in components/features/books/book-detail.tsx
 */
export interface BookDetailProps {
  book: Book;
}

/**
 * Props for the BooksWindow client component
 * Used in components/features/books/books-window.client.tsx
 */
export interface BooksWindowProps {
  children: React.ReactNode;
  windowTitle?: string;
  windowId?: string;
}

/**
 * Props for the BooksWindowContent internal component
 * Used internally by BooksWindow for the window content
 */
export interface BooksWindowContentProps {
  children: React.ReactNode;
  windowState: string;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  windowTitle?: string;
}

/**
 * Props for the BooksClientGrid component
 * Used in components/features/books/books-grid.client.tsx
 */
export interface BooksClientGridProps {
  books: BookListItem[];
  title: string;
  description: string;
  disclaimer?: string;
  error?: string | null;
}

// =============================================================================
// SERVER COMPONENT PROPS
// =============================================================================

/**
 * Props for the BooksServer component
 * Used in components/features/books/books.server.tsx
 */
export interface BooksServerProps {
  title: string;
  description: string;
  disclaimer?: string;
}
