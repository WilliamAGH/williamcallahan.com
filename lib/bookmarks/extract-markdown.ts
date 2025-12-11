/**
 * Markdown Content Extraction Module
 *
 * DISABLED: Jina AI scraping was causing DOM warnings to appear in bookmark descriptions
 * This module has been disabled to prevent content corruption
 *
 * @module bookmarks/extract-markdown
 */

import type { ExtractedContent } from "@/types/bookmark";

/**
 * Extract markdown content from a bookmark URL
 * DISABLED: Returns null to prevent Jina AI scraping
 *
 * @returns Always returns null - scraping is disabled
 */
export function extractMarkdownContent(): Promise<ExtractedContent | null> {
  // SCRAPING DISABLED - Jina AI was injecting DOM warnings and corrupting bookmark descriptions
  return Promise.resolve(null);
}

/**
 * Apply extracted content to a bookmark
 * DISABLED: No content extraction occurs
 */
export function applyExtractedContent(): void {
  // Function disabled - no content extraction or application
  return;
}
