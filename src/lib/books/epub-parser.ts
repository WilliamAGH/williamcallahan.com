/**
 * ePub Parser Utility
 * @module lib/books/epub-parser
 * @description
 * Parses ePub files to extract text content, metadata, and chapter structure.
 * Uses epub2 package for parsing and provides clean text output suitable for
 * vector embedding in Chroma.
 */

import { writeFile, unlink, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EPub from "epub2";

// =============================================================================
// TYPES
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
// HTML TO TEXT CONVERSION
// =============================================================================

/**
 * Convert HTML content to plain text
 * Strips tags, decodes entities, and normalizes whitespace
 */
function htmlToText(html: string): string {
  // Remove script and style elements entirely
  let text = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");

  // Replace block-level elements with newlines
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|br|hr)[^>]*>/gi, "\n");
  text = text.replace(/<br[^>]*\/?>/gi, "\n");

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));

  // Normalize whitespace
  text = text
    .replace(/[ \t]+/g, " ") // Multiple spaces/tabs to single space
    .replace(/\n[ \t]+/g, "\n") // Remove leading whitespace from lines
    .replace(/[ \t]+\n/g, "\n") // Remove trailing whitespace from lines
    .replace(/\n{3,}/g, "\n\n") // Max 2 consecutive newlines
    .trim();

  return text;
}

/**
 * Count words in text
 */
function countWords(text: string): number {
  return text.split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Format a chapter ID into a human-readable title
 * e.g., "fm01" -> "Front Matter 1", "ch05" -> "Chapter 5", "part02" -> "Part 2"
 */
function formatChapterIdAsTitle(id: string): string {
  // Common prefixes in ePub chapter IDs
  const prefixMap: Record<string, string> = {
    fm: "Front Matter",
    ch: "Chapter",
    chapter: "Chapter",
    part: "Part",
    sec: "Section",
    app: "Appendix",
    appendix: "Appendix",
    toc: "Table of Contents",
    cover: "Cover",
    title: "Title Page",
    copyright: "Copyright",
    dedication: "Dedication",
    preface: "Preface",
    intro: "Introduction",
    conclusion: "Conclusion",
    epilogue: "Epilogue",
    prologue: "Prologue",
    bib: "Bibliography",
    index: "Index",
    glossary: "Glossary",
    ack: "Acknowledgments",
  };

  // Try to match prefix + number pattern
  const match = id.match(/^([a-z]+)[-_]?(\d+)?$/i);
  if (match) {
    const [, prefix, num] = match;
    const lowerPrefix = prefix?.toLowerCase() ?? "";
    const label = prefixMap[lowerPrefix] || prefix;
    return num ? `${label} ${parseInt(num, 10)}` : (label ?? id);
  }

  // Fallback: just return the ID cleaned up
  return id.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// =============================================================================
// METADATA EXTRACTION
// =============================================================================

/**
 * Extract comprehensive metadata from an epub2 EPub instance
 * Handles Dublin Core, EPUB 3, and Calibre extension fields
 *
 * @param epub - The parsed EPub instance from epub2
 * @returns Complete EpubMetadata object
 */
function extractMetadataFromEpub(epub: EPub): EpubMetadata {
  const rawMeta = epub.metadata as Record<string, unknown>;

  // Extract series information from various sources
  const series =
    (rawMeta["belongs-to-collection"] as string) ||
    (rawMeta["calibre:series"] as string) ||
    (rawMeta.series as string) ||
    undefined;

  // Series index can be in different formats
  const seriesIndexRaw = rawMeta["group-position"] || rawMeta["calibre:series_index"] || rawMeta.seriesIndex;
  const seriesIndex = seriesIndexRaw ? Number(seriesIndexRaw) : undefined;

  // Handle contributors (can be string or array)
  const contributorRaw = rawMeta.contributor;
  const contributors = Array.isArray(contributorRaw)
    ? contributorRaw
    : contributorRaw
      ? [String(contributorRaw)]
      : undefined;

  const metadata: EpubMetadata = {
    // Core Dublin Core
    title: epub.metadata.title ?? "Unknown Title",
    author: epub.metadata.creator ?? "Unknown Author",
    authorFileAs: epub.metadata.creatorFileAs,
    publisher: epub.metadata.publisher,
    language: epub.metadata.language,
    description: epub.metadata.description,
    date: epub.metadata.date,
    subjects: Array.isArray(epub.metadata.subject)
      ? epub.metadata.subject
      : epub.metadata.subject
        ? [epub.metadata.subject]
        : undefined,

    // Identifiers
    isbn: epub.metadata.ISBN,
    uuid: epub.metadata.UUID,

    // Series
    series,
    seriesIndex: Number.isFinite(seriesIndex) ? seriesIndex : undefined,

    // Additional
    rights: rawMeta.rights as string | undefined,
    contributors,
    coverId: rawMeta.cover as string | undefined,

    // Raw for debugging (filter out symbols and undefined values)
    rawMetadata: Object.fromEntries(
      Object.entries(rawMeta).filter(([key, val]) => typeof key === "string" && val !== undefined),
    ),
  };

  // Log metadata for debugging in development
  if (process.env.NODE_ENV === "development") {
    console.log("[EpubParser] Raw metadata keys:", Object.keys(rawMeta));
    console.log("[EpubParser] Extracted metadata:", {
      ...metadata,
      rawMetadata: undefined, // Don't log full raw
    });
  }

  return metadata;
}

// =============================================================================
// EPUB PARSING
// =============================================================================

/**
 * Parse an ePub file from a buffer
 *
 * @param buffer - The ePub file content as a Buffer
 * @param options - Parsing options
 * @returns Parsed ePub content with metadata and chapters
 */
export async function parseEpubFromBuffer(buffer: Buffer, options: EpubParseOptions = {}): Promise<ParsedEpub> {
  const { maxChapters, includeHtml = false } = options;

  // Create a temporary directory for the file
  const tempDir = await mkdtemp(join(tmpdir(), "epub-"));
  const tempFilePath = join(tempDir, "book.epub");

  try {
    // Write buffer to temp file (epub2 requires a file path)
    await writeFile(tempFilePath, buffer);

    // Parse the ePub file
    const epub = await EPub.createAsync(tempFilePath);

    // Extract comprehensive metadata
    const metadata = extractMetadataFromEpub(epub);

    // Extract chapters
    const chapters: EpubChapter[] = [];
    const flow = epub.flow;

    // Build a map from chapter ID to TOC title for fallback
    // The TOC often has better titles than the spine/flow
    const tocTitleMap = new Map<string, string>();
    if (epub.toc && Array.isArray(epub.toc)) {
      for (const tocItem of epub.toc) {
        if (tocItem.id && tocItem.title) {
          tocTitleMap.set(tocItem.id, tocItem.title);
        }
      }
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[EpubParser] TOC entries:", epub.toc?.length ?? 0);
      console.log("[EpubParser] Flow entries:", flow.length);
    }

    // Determine how many chapters to process
    const chaptersToProcess = maxChapters ? flow.slice(0, maxChapters) : flow;

    for (let i = 0; i < chaptersToProcess.length; i++) {
      const chapter = chaptersToProcess[i];
      if (!chapter?.id) continue;

      try {
        // Get chapter HTML content
        const htmlContent = await epub.getChapterAsync(chapter.id);

        // Convert to plain text
        const textContent = htmlToText(htmlContent);

        // Skip empty chapters
        if (textContent.length < 10) continue;

        // Get title: prefer flow title, fallback to TOC title, then generate from ID
        const title = chapter.title || tocTitleMap.get(chapter.id) || formatChapterIdAsTitle(chapter.id);

        chapters.push({
          id: chapter.id,
          title,
          order: i,
          htmlContent: includeHtml ? htmlContent : "",
          textContent,
          wordCount: countWords(textContent),
        });
      } catch (chapterError) {
        // Log but continue with other chapters
        console.warn(`[EpubParser] Failed to extract chapter ${chapter.id}:`, chapterError);
      }
    }

    // Calculate totals
    const totalWordCount = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);

    return {
      metadata,
      chapters,
      totalWordCount,
      totalChapters: chapters.length,
    };
  } finally {
    // Clean up temp file
    try {
      await unlink(tempFilePath);
      // Note: Temp directory cleanup is handled by OS
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Extract only metadata from an ePub file (faster, doesn't parse chapters)
 *
 * @param buffer - The ePub file content as a Buffer
 * @returns ePub metadata
 */
export async function extractEpubMetadata(buffer: Buffer): Promise<EpubMetadata> {
  const tempDir = await mkdtemp(join(tmpdir(), "epub-"));
  const tempFilePath = join(tempDir, "book.epub");

  try {
    await writeFile(tempFilePath, buffer);
    const epub = await EPub.createAsync(tempFilePath);
    return extractMetadataFromEpub(epub);
  } finally {
    try {
      await unlink(tempFilePath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Get all text content from an ePub as a single string
 * Useful for creating a single document for vector embedding
 *
 * @param buffer - The ePub file content as a Buffer
 * @param options - Parsing options
 * @returns Combined text content with metadata header
 */
export async function getEpubFullText(buffer: Buffer, options: EpubParseOptions = {}): Promise<string> {
  const parsed = await parseEpubFromBuffer(buffer, options);

  // Build header with metadata
  const header = [
    `Title: ${parsed.metadata.title}`,
    `Author: ${parsed.metadata.author}`,
    parsed.metadata.publisher && `Publisher: ${parsed.metadata.publisher}`,
    parsed.metadata.date && `Date: ${parsed.metadata.date}`,
    parsed.metadata.isbn && `ISBN: ${parsed.metadata.isbn}`,
    parsed.metadata.description && `Description: ${parsed.metadata.description}`,
    "",
    "---",
    "",
  ]
    .filter(Boolean)
    .join("\n");

  // Combine chapters with titles
  const body = parsed.chapters
    .map(ch => {
      const title = ch.title ? `## ${ch.title}\n\n` : "";
      return title + ch.textContent;
    })
    .join("\n\n---\n\n");

  return header + body;
}
