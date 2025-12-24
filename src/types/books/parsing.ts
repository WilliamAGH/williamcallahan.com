/**
 * Book Parsing Types
 * @module types/books/parsing
 * @description
 * Type definitions for book parsing (PDF, ePub) and vector embedding operations.
 * Used by lib/books/* modules for parsing and indexing book content.
 */

// =============================================================================
// EPUB TYPES
// =============================================================================

/**
 * Metadata extracted from an ePub file
 * Based on Dublin Core, EPUB 3 spec, and common calibre extensions
 */
export interface EpubMetadata {
  // Core Dublin Core metadata
  title: string;
  author: string;
  authorFileAs?: string;
  publisher?: string;
  language?: string;
  description?: string;
  date?: string;
  subjects?: string[];

  // Identifiers
  isbn?: string;
  uuid?: string;

  // Series information
  series?: string;
  seriesIndex?: number;

  // Additional metadata
  rights?: string;
  contributors?: string[];
  coverId?: string;

  // Raw metadata for debugging/extension
  rawMetadata?: Record<string, unknown>;
}

/**
 * A chapter extracted from an ePub file
 */
export interface EpubChapter {
  id: string;
  title?: string;
  order: number;
  htmlContent: string;
  textContent: string;
  wordCount: number;
}

/**
 * Complete parsed result from an ePub file
 */
export interface ParsedEpub {
  metadata: EpubMetadata;
  chapters: EpubChapter[];
  totalWordCount: number;
  totalChapters: number;
}

/**
 * Options for parsing an ePub
 */
export interface EpubParseOptions {
  /**
   * Maximum number of chapters to extract (default: all)
   */
  maxChapters?: number;
  /**
   * Whether to include HTML content in output (default: false)
   */
  includeHtml?: boolean;
}

// =============================================================================
// PDF TYPES
// =============================================================================

/**
 * PDF Info dictionary from pdf-parse (loosely typed by library)
 */
export interface PdfInfoDictionary {
  Title?: string;
  Author?: string;
  Publisher?: string;
  Subject?: string;
  CreationDate?: string;
  ModDate?: string;
  [key: string]: unknown;
}

/**
 * A page extracted from a PDF file
 */
export interface PdfPage {
  pageNumber: number;
  textContent: string;
  wordCount: number;
}

/**
 * Complete parsed result from a PDF file
 */
export interface ParsedPdf {
  metadata: EpubMetadata;
  pages: PdfPage[];
  totalWordCount: number;
  totalPages: number;
}

/**
 * Options for parsing a PDF
 */
export interface PdfParseOptions {
  /**
   * Maximum number of pages to extract (default: all)
   */
  maxPages?: number;
}

// =============================================================================
// TEXT CHUNKING TYPES
// =============================================================================

/**
 * A single text chunk with metadata
 */
export interface TextChunk {
  /** Unique index of this chunk within the source */
  index: number;
  /** The chunk text content */
  text: string;
  /** Word count of this chunk */
  wordCount: number;
  /** Starting character offset in original text */
  startOffset: number;
  /** Ending character offset in original text */
  endOffset: number;
  /** Optional chapter/section identifier */
  chapterId?: string;
  /** Optional chapter/section title */
  chapterTitle?: string;
}

/**
 * Configuration for text chunking
 */
export interface ChunkingOptions {
  /**
   * Target number of words per chunk (default: 500)
   */
  targetWords?: number;
  /**
   * Maximum words per chunk (default: 750)
   */
  maxWords?: number;
  /**
   * Minimum words per chunk - smaller chunks are merged (default: 100)
   */
  minWords?: number;
  /**
   * Number of words to overlap between chunks (default: 50)
   */
  overlapWords?: number;
  /**
   * Chapter/section identifier to attach to chunks
   */
  chapterId?: string;
  /**
   * Chapter/section title to attach to chunks
   */
  chapterTitle?: string;
}

// =============================================================================
// CHROMA SYNC TYPES
// =============================================================================

/**
 * Metadata stored with each book chunk in Chroma
 */
export interface BookChunkMetadata {
  /** Book identifier (S3 key or UUID) */
  bookId: string;
  /** Book title */
  title: string;
  /** Book author */
  author: string;
  /** ISBN if available */
  isbn: string;
  /** File type (pdf, epub) */
  fileType: string;
  /** Chapter ID within the book */
  chapterId: string;
  /** Chapter title if available */
  chapterTitle: string;
  /** Chunk index within the book */
  chunkIndex: number;
  /** Total chunks in the book */
  totalChunks: number;
  /** Word count of this chunk */
  wordCount: number;
  /** Content type for cross-collection queries */
  contentType: "book-chunk";
  /** Timestamp when indexed */
  indexedAt: string;
  /** Subjects/genres as comma-separated string (Chroma doesn't support arrays) */
  subjects: string;
  /** Publisher if available */
  publisher: string;
  /** Publication date if available */
  publishedDate: string;
  /** Language code (e.g., "en") */
  language: string;
  /** Series name if part of a series */
  series: string;
  /** Position in series (as string for Chroma compatibility) */
  seriesIndex: string;
}

/**
 * Book data prepared for Chroma indexing
 */
export interface BookIndexData {
  /** Unique book identifier */
  bookId: string;
  /** Book metadata */
  metadata: EpubMetadata;
  /** Text chunks with chapter info */
  chunks: TextChunk[];
  /** Original file type */
  fileType: "book-pdf" | "book-epub";
}

/**
 * Result from indexing a book
 */
export interface BookIndexResult {
  success: boolean;
  bookId: string;
  chunksIndexed: number;
  collectionName: string;
  error?: string;
}

// =============================================================================
// EPUB2 LIBRARY TYPE AUGMENTATION
// =============================================================================

/**
 * Flow item from epub2 spine/reading order
 * The epub2 package has weak types, so we define what we expect
 */
export interface EpubFlowItem {
  id: string;
  href?: string;
  title?: string;
}

/**
 * TOC item from epub2 table of contents
 */
export interface EpubTocItem {
  id: string;
  title?: string;
  href?: string;
  order?: number;
}

/**
 * Augmented EPub metadata type for type-safe access
 * The epub2 package's metadata property is loosely typed
 */
export interface EpubRawMetadata {
  title?: string;
  creator?: string;
  creatorFileAs?: string;
  publisher?: string;
  language?: string;
  description?: string;
  date?: string;
  subject?: string | string[];
  ISBN?: string;
  UUID?: string;
  rights?: string;
  cover?: string;
  contributor?: string | string[];
  "belongs-to-collection"?: string;
  "calibre:series"?: string;
  "calibre:series_index"?: string;
  series?: string;
  seriesIndex?: string;
  "group-position"?: string;
  [key: string]: unknown;
}
