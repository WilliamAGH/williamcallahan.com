/**
 * ePub Parser Utility
 * @module lib/books/epub-parser
 * @description
 * Parses ePub files to extract text content, metadata, and chapter structure.
 * Uses epub2 package for parsing and provides clean text output suitable for
 * vector embedding in Chroma.
 */

import { writeFile, unlink, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EPub from "epub2";
import type { TocElement, IMetadata } from "epub2/lib/epub/const";
import type {
  EpubMetadata,
  EpubChapter,
  ParsedEpub,
  EpubParseOptions,
} from "@/types/books/parsing";
import { epubMetadataSchema } from "@/types/schemas/book";

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
    .replace(/&#(\d+);/g, (_, code: string) => {
      const value = Number(code);
      // Use fromCodePoint to handle non-BMP characters (emoji, etc.) above 0xFFFF
      return Number.isFinite(value) && value >= 0 && value <= 0x10ffff
        ? String.fromCodePoint(value)
        : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => {
      const value = Number.parseInt(code, 16);
      return Number.isFinite(value) && value >= 0 && value <= 0x10ffff
        ? String.fromCodePoint(value)
        : "";
    });

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
  return text.split(/\s+/).filter((word) => word.length > 0).length;
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
  return id.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
  // epub.metadata is typed as IMetadata which has [key: string]: any for extension fields
  const rawMeta: IMetadata = epub.metadata;

  // Type guard helpers for IMetadata boundary validation
  // IMetadata has [key: string]: any, so any field could be non-string
  const asString = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim().length > 0 ? value : undefined;
  const asStringArray = (value: unknown): string[] | undefined =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
      : typeof value === "string" && value.length > 0
        ? [value]
        : undefined;

  // Extract series information from various sources
  const seriesRaw: unknown =
    rawMeta["belongs-to-collection"] ?? rawMeta["calibre:series"] ?? rawMeta.series;
  const series = asString(seriesRaw);

  // Series index can be in different formats
  const seriesIndexRaw: unknown =
    rawMeta["group-position"] ?? rawMeta["calibre:series_index"] ?? rawMeta.seriesIndex;
  const seriesIndex =
    typeof seriesIndexRaw === "string" || typeof seriesIndexRaw === "number"
      ? Number(seriesIndexRaw)
      : undefined;

  // Handle contributors (can be string or array of strings)
  const contributors = asStringArray(rawMeta.contributor);

  // Extract rights with type narrowing
  const rights = asString(rawMeta.rights);

  const metadata: EpubMetadata = {
    // Core Dublin Core - apply type guards at boundary
    title: asString(rawMeta.title) ?? "Unknown Title",
    author: asString(rawMeta.creator) ?? "Unknown Author",
    authorFileAs: asString(rawMeta.creatorFileAs),
    publisher: asString(rawMeta.publisher),
    language: asString(rawMeta.language),
    description: asString(rawMeta.description),
    date: asString(rawMeta.date),
    subjects: asStringArray(rawMeta.subject),

    // Identifiers
    isbn: asString(rawMeta.ISBN),
    uuid: asString(rawMeta.UUID),

    // Series
    series,
    seriesIndex: Number.isFinite(seriesIndex) ? seriesIndex : undefined,

    // Additional
    rights,
    contributors,
    coverId: asString(rawMeta.cover),

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

  // Validate at the IO boundary - EPUB files are untrusted external input
  // This catches malformed metadata and ensures type safety at runtime
  return epubMetadataSchema.parse(metadata);
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
export async function parseEpubFromBuffer(
  buffer: Buffer,
  options: EpubParseOptions = {},
): Promise<ParsedEpub> {
  const { maxChapters, includeHtml = false } = options;

  // Normalize maxChapters: only use if it's a finite positive integer
  // A value of 0 would mean "no chapters" which is likely a mistake, so treat as undefined
  const normalizedMaxChapters =
    typeof maxChapters === "number" && Number.isFinite(maxChapters) && maxChapters > 0
      ? Math.floor(maxChapters)
      : undefined;

  // Create a temporary directory for the file
  const tempDir = await mkdtemp(join(tmpdir(), "epub-"));
  const tempFilePath = join(tempDir, "book.epub");

  try {
    // Write buffer to temp file (epub2 requires a file path)
    await writeFile(tempFilePath, buffer);

    // Parse the ePub file - epub2.createAsync returns Promise<any>, cast to EPub
    const epub = (await EPub.createAsync(tempFilePath)) as EPub;

    // Extract comprehensive metadata
    const metadata = extractMetadataFromEpub(epub);

    // Extract chapters
    const chapters: EpubChapter[] = [];
    // epub.flow is typed as ISpineContents (extends Array<TocElement>)
    const flow: TocElement[] = epub.flow;

    // Build a map from chapter ID to TOC title for fallback
    // The TOC often has better titles than the spine/flow
    const tocTitleMap = new Map<string, string>();
    // epub.toc is typed as ISpineContents (extends Array<TocElement>)
    const toc: TocElement[] = epub.toc;
    if (toc && Array.isArray(toc)) {
      for (const tocItem of toc) {
        if (tocItem.id && tocItem.title) {
          tocTitleMap.set(tocItem.id, tocItem.title);
        }
      }
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[EpubParser] TOC entries:", toc?.length ?? 0);
      console.log("[EpubParser] Flow entries:", flow.length);
    }

    // Determine how many chapters to process
    const chaptersToProcess = normalizedMaxChapters ? flow.slice(0, normalizedMaxChapters) : flow;

    for (let i = 0; i < chaptersToProcess.length; i++) {
      const chapter = chaptersToProcess[i];
      if (!chapter?.id) continue;

      try {
        // Get chapter HTML content - epub.getChapterAsync returns Promise<any>
        // Validate the result is actually a string before processing
        const htmlContentRaw: unknown = await epub.getChapterAsync(chapter.id);
        const htmlContent =
          typeof htmlContentRaw === "string"
            ? htmlContentRaw
            : Buffer.isBuffer(htmlContentRaw)
              ? htmlContentRaw.toString("utf-8")
              : "";
        if (!htmlContent) continue;

        // Convert to plain text
        const textContent = htmlToText(htmlContent);

        // Skip empty chapters
        if (textContent.length < 10) continue;

        // Get title: prefer flow title, fallback to TOC title, then generate from ID
        const title =
          chapter.title ?? tocTitleMap.get(chapter.id) ?? formatChapterIdAsTitle(chapter.id);

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
    // Clean up temp file and directory
    try {
      await unlink(tempFilePath);
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors - temp dir may already be cleaned
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
    // EPub.createAsync returns bluebird Promise<EPub> - cast to fix type compatibility
    const epub = (await EPub.createAsync(tempFilePath)) as EPub;
    return extractMetadataFromEpub(epub);
  } finally {
    // Clean up temp file and directory
    try {
      await unlink(tempFilePath);
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors - temp dir may already be cleaned
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
export async function getEpubFullText(
  buffer: Buffer,
  options: EpubParseOptions = {},
): Promise<string> {
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
    .map((ch) => {
      const title = ch.title ? `## ${ch.title}\n\n` : "";
      return title + ch.textContent;
    })
    .join("\n\n---\n\n");

  return header + body;
}
