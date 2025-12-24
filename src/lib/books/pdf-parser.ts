/**
 * PDF Parser Utility
 * @module lib/books/pdf-parser
 * @description
 * Parses PDF files to extract text content, metadata, and page structure.
 * Uses pdf-parse v2 for parsing and provides clean text output suitable for
 * vector embedding in Chroma.
 */

import { PDFParse } from "pdf-parse";
import type { EpubMetadata, PdfInfoDictionary, PdfPage, ParsedPdf, PdfParseOptions } from "@/types/books/parsing";

/**
 * Type guard to safely extract string from PDF info field
 */
function getInfoString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Count words in text
 */
function countWords(text: string): number {
  return text.split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Clean and normalize text from PDF
 */
function normalizeText(text: string): string {
  return text
    .replace(/[ \t]+/g, " ") // Multiple spaces/tabs to single space
    .replace(/\n[ \t]+/g, "\n") // Remove leading whitespace from lines
    .replace(/[ \t]+\n/g, "\n") // Remove trailing whitespace from lines
    .replace(/\n{3,}/g, "\n\n") // Max 2 consecutive newlines
    .trim();
}

// =============================================================================
// PDF PARSING
// =============================================================================

/**
 * Parse a PDF file from a buffer
 *
 * @param buffer - The PDF file content as a Buffer
 * @param options - Parsing options
 * @returns Parsed PDF content with metadata and pages
 */
export async function parsePdfFromBuffer(buffer: Buffer, options: PdfParseOptions = {}): Promise<ParsedPdf> {
  const { maxPages } = options;

  // Create parser with buffer data
  const parser = new PDFParse({ data: buffer });

  try {
    // Get metadata first
    const info = await parser.getInfo();

    // Extract metadata from PDF info dictionary with type guards
    const pdfInfo = (info.info ?? {}) as PdfInfoDictionary;
    const metadata: EpubMetadata = {
      title: getInfoString(pdfInfo.Title) ?? "Unknown Title",
      author: getInfoString(pdfInfo.Author) ?? "Unknown Author",
      publisher: getInfoString(pdfInfo.Publisher),
      description: getInfoString(pdfInfo.Subject),
      date: pdfInfo.CreationDate
        ? formatPdfDate(String(pdfInfo.CreationDate))
        : pdfInfo.ModDate
          ? formatPdfDate(String(pdfInfo.ModDate))
          : undefined,
    };

    // Get text content
    const textResult = await parser.getText({
      partial: maxPages ? Array.from({ length: maxPages }, (_, i) => i + 1) : undefined,
    });

    // Process pages
    const pages: PdfPage[] = [];

    for (const page of textResult.pages) {
      const textContent = normalizeText(page.text);

      // Skip pages with minimal content
      if (textContent.length < 10) continue;

      pages.push({
        pageNumber: page.num,
        textContent,
        wordCount: countWords(textContent),
      });
    }

    // Calculate totals
    const totalWordCount = pages.reduce((sum, p) => sum + p.wordCount, 0);

    return {
      metadata,
      pages,
      totalWordCount,
      totalPages: pages.length,
    };
  } finally {
    // Always destroy the parser to free memory
    await parser.destroy();
  }
}

/**
 * Format PDF date string to ISO format
 * PDF dates are in format "D:YYYYMMDDHHmmSS" or ISO
 */
function formatPdfDate(dateString: string): string | undefined {
  if (!dateString) return undefined;

  // Check if already ISO format
  if (dateString.includes("-")) {
    return dateString;
  }

  // Parse PDF date format: D:YYYYMMDDHHmmSSOHH'mm'
  const match = dateString.match(/D:(\d{4})(\d{2})(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return `${year}-${month}-${day}`;
  }

  return undefined;
}

/**
 * Extract only metadata from a PDF file (faster, doesn't parse pages)
 *
 * @param buffer - The PDF file content as a Buffer
 * @returns PDF metadata
 */
export async function extractPdfMetadata(buffer: Buffer): Promise<EpubMetadata> {
  const parser = new PDFParse({ data: buffer });

  try {
    const info = await parser.getInfo();
    const pdfInfo = (info.info ?? {}) as PdfInfoDictionary;

    return {
      title: getInfoString(pdfInfo.Title) ?? "Unknown Title",
      author: getInfoString(pdfInfo.Author) ?? "Unknown Author",
      publisher: getInfoString(pdfInfo.Publisher),
      description: getInfoString(pdfInfo.Subject),
      date: pdfInfo.CreationDate
        ? formatPdfDate(String(pdfInfo.CreationDate))
        : pdfInfo.ModDate
          ? formatPdfDate(String(pdfInfo.ModDate))
          : undefined,
    };
  } finally {
    await parser.destroy();
  }
}

/**
 * Get all text content from a PDF as a single string
 * Useful for creating a single document for vector embedding
 *
 * @param buffer - The PDF file content as a Buffer
 * @param options - Parsing options
 * @returns Combined text content with metadata header
 */
export async function getPdfFullText(buffer: Buffer, options: PdfParseOptions = {}): Promise<string> {
  const parsed = await parsePdfFromBuffer(buffer, options);

  // Build header with metadata
  const header = [
    `Title: ${parsed.metadata.title}`,
    `Author: ${parsed.metadata.author}`,
    parsed.metadata.publisher && `Publisher: ${parsed.metadata.publisher}`,
    parsed.metadata.date && `Date: ${parsed.metadata.date}`,
    parsed.metadata.description && `Description: ${parsed.metadata.description}`,
    "",
    "---",
    "",
  ]
    .filter(Boolean)
    .join("\n");

  // Combine pages
  const body = parsed.pages
    .map(p => {
      const pageHeader = `## Page ${p.pageNumber}\n\n`;
      return pageHeader + p.textContent;
    })
    .join("\n\n---\n\n");

  return header + body;
}
