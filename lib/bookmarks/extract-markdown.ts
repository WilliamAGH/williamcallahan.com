/**
 * Markdown Content Extraction Module
 * 
 * Handles efficient extraction of markdown content from bookmarks using Jina AI Reader
 * with memory-conscious processing and hash-based caching
 * 
 * @module bookmarks/extract-markdown
 */

import { getCachedJinaMarkdown, persistJinaMarkdownInBackground } from "@/lib/persistence/s3-persistence";
import { incrementAndPersist } from "@/lib/rate-limiter";
import { debug, debugWarn } from "@/lib/utils/debug";
import {
  JINA_FETCH_CONFIG,
  JINA_FETCH_STORE_NAME,
  JINA_FETCH_CONTEXT_ID,
  JINA_FETCH_RATE_LIMIT_S3_PATH,
} from "@/lib/constants";
import type { UnifiedBookmark, ExtractedContent } from "@/types/bookmark";


/**
 * Calculate reading time from word count
 * Average reading speed: 200-250 words per minute
 */
function calculateReadingTime(wordCount: number): number {
  const WORDS_PER_MINUTE = 225;
  return Math.ceil(wordCount / WORDS_PER_MINUTE);
}

/**
 * Count words in markdown text
 */
function countWords(text: string): number {
  // Remove markdown syntax for accurate count
  const cleanText = text
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .replace(/`[^`]*`/g, '') // Remove inline code
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // Convert links to text
    .replace(/[#*_~>-]/g, '') // Remove markdown symbols
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '') // Remove images
    .trim();
  
  return cleanText.split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Extract markdown content from a bookmark URL using Jina AI Reader
 * Memory-efficient: processes one bookmark at a time
 * 
 * @param bookmark - Bookmark to extract content from
 * @returns Extracted content or null if extraction fails
 */
export async function extractMarkdownContent(
  bookmark: UnifiedBookmark
): Promise<ExtractedContent | null> {
  if (!bookmark.url) {
    debugWarn(`[Markdown Extract] No URL for bookmark ${bookmark.id}`);
    return null;
  }

  // 1. Check for cached markdown content first (avoids API call)
  const cached = await getCachedJinaMarkdown(bookmark.url);
  if (cached) {
    debug(`[Markdown Extract] Using cached markdown for: ${bookmark.url}`);
    const wordCount = countWords(cached);
    return {
      markdown: cached,
      wordCount,
      readingTime: calculateReadingTime(wordCount),
      extractedAt: new Date().toISOString(),
    };
  }

  // 2. Check rate limit before fetching
  if (!incrementAndPersist(
    JINA_FETCH_STORE_NAME,
    JINA_FETCH_CONTEXT_ID,
    JINA_FETCH_CONFIG,
    JINA_FETCH_RATE_LIMIT_S3_PATH,
  )) {
    debugWarn(`[Markdown Extract] Rate limit exceeded for Jina AI Reader`);
    return null;
  }

  try {
    // 3. Fetch markdown content from Jina AI Reader
    debug(`[Markdown Extract] Fetching markdown via Jina AI Reader: ${bookmark.url}`);
    const response = await fetch(`https://r.jina.ai/${bookmark.url}`, {
      headers: { 
        "x-respond-with": "markdown",
        "Accept": "text/plain"
      },
      signal: AbortSignal.timeout(30000), // 30s timeout
    });

    if (!response.ok) {
      throw new Error(`Jina AI Reader failed with status: ${response.status}`);
    }

    const markdown = await response.text();
    
    // Validate we got markdown, not HTML
    if (markdown.trim().startsWith('<!DOCTYPE') || markdown.trim().startsWith('<html')) {
      throw new Error('Received HTML instead of markdown from Jina AI');
    }

    const wordCount = countWords(markdown);
    const extractedContent: ExtractedContent = {
      markdown,
      wordCount,
      readingTime: calculateReadingTime(wordCount),
      extractedAt: new Date().toISOString(),
    };

    // 4. Persist to S3 in background (fire and forget for memory efficiency)
    persistJinaMarkdownInBackground(bookmark.url, markdown);

    debug(`[Markdown Extract] Successfully extracted ${wordCount} words from: ${bookmark.url}`);
    return extractedContent;

  } catch (error) {
    debugWarn(`[Markdown Extract] Failed to extract markdown for ${bookmark.url}:`, error);
    return null;
  }
}

/**
 * Memory-efficient batch processor for markdown extraction
 * Processes bookmarks sequentially to avoid memory spikes
 * 
 * @param bookmarks - Bookmarks to process
 * @param onProgress - Optional callback for progress updates
 * @returns Map of bookmark ID to extracted content
 */
export async function extractMarkdownBatch(
  bookmarks: UnifiedBookmark[],
  onProgress?: (processed: number, total: number) => void
): Promise<Map<string, ExtractedContent>> {
  const results = new Map<string, ExtractedContent>();
  let processed = 0;
  
  // Process sequentially to minimize memory usage
  for (const bookmark of bookmarks) {
    // Check memory pressure before processing
    if (global.gc && process.memoryUsage().rss > 2.5e9) {
      debug(`[Markdown Extract] Running GC at bookmark ${processed + 1}/${bookmarks.length}`);
      global.gc();
    }
    
    const content = await extractMarkdownContent(bookmark);
    if (content) {
      results.set(bookmark.id, content);
    }
    
    processed++;
    onProgress?.(processed, bookmarks.length);
    
    // Small delay to prevent rate limiting
    if (processed < bookmarks.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}

/**
 * Update bookmark with extracted content data
 * This modifies the bookmark in-place for memory efficiency
 * 
 * @param bookmark - Bookmark to update
 * @param content - Extracted content data
 */
export function applyExtractedContent(
  bookmark: UnifiedBookmark,
  content: ExtractedContent
): void {
  // Update reading metrics
  bookmark.wordCount = content.wordCount;
  bookmark.readingTime = content.readingTime;
  
  // Store a summary instead of full content to save memory
  // Take first 200 characters of markdown as summary if none exists
  if (!bookmark.summary && content.markdown) {
    const cleanSummary = content.markdown
      .replace(/[#*_~>-]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 200);
    bookmark.summary = cleanSummary + (content.markdown.length > 200 ? '...' : '');
  }
  
  // Note: We don't store the full markdown in the bookmark
  // It's persisted to S3 and can be retrieved when needed
}