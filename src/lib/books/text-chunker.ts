/**
 * Text Chunking Utility for Vector Embedding
 * @module lib/books/text-chunker
 * @description
 * Splits long text into semantically coherent chunks suitable for vector embedding.
 * Designed for book content where maintaining context across chunks is important.
 *
 * Key design decisions:
 * - Target ~500 words per chunk (optimal for semantic search)
 * - Overlap between chunks to preserve context at boundaries
 * - Prefer breaking at paragraph/sentence boundaries
 * - Preserve chapter boundaries when provided
 */

import type { TextChunk, ChunkingOptions } from "@/types/books/parsing";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Default chunking configuration values.
 * These values are optimized for semantic search with embedding models.
 *
 * - TARGET_WORDS: ~500 words is optimal for most embedding models (OpenAI, Cohere)
 * - MAX_WORDS: Upper limit prevents chunks that are too large for context windows
 * - MIN_WORDS: Prevents tiny fragments that lack semantic meaning
 * - OVERLAP_WORDS: ~10% overlap preserves context at chunk boundaries
 */
const CHUNKING_DEFAULTS = {
  /** Target words per chunk - optimal for embedding models */
  TARGET_WORDS: 500,
  /** Maximum words per chunk - prevents oversized chunks */
  MAX_WORDS: 750,
  /** Minimum words per chunk - smaller chunks are merged with neighbors */
  MIN_WORDS: 100,
  /** Overlap words between chunks - preserves context at boundaries */
  OVERLAP_WORDS: 50,
  /** Search range multiplier for break point detection (in words) */
  BREAK_SEARCH_RANGE_WORDS: 100,
} as const;

// =============================================================================
// CHUNKING IMPLEMENTATION
// =============================================================================

/**
 * Count words in text
 */
function countWords(text: string): number {
  return text.split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Find the best break point near a target position
 * Prefers paragraph breaks > sentence breaks > word breaks
 */
function findBreakPoint(text: string, targetPos: number, searchRange: number): number {
  const start = Math.max(0, targetPos - searchRange);
  const end = Math.min(text.length, targetPos + searchRange);
  const searchText = text.slice(start, end);

  // Look for paragraph break (double newline)
  const paragraphBreak = searchText.lastIndexOf("\n\n");
  if (paragraphBreak !== -1) {
    return start + paragraphBreak + 2;
  }

  // Look for sentence break (period, exclamation, question mark followed by space)
  const sentencePattern = /[.!?]\s/g;
  let lastSentenceEnd = -1;
  // Explicitly type regex match result to avoid unsafe-any warnings
  let regexMatch: globalThis.RegExpExecArray | null;
  while ((regexMatch = sentencePattern.exec(searchText)) !== null) {
    lastSentenceEnd = regexMatch.index + 1;
  }
  if (lastSentenceEnd !== -1) {
    return start + lastSentenceEnd + 1;
  }

  // Fall back to word break (space)
  const lastSpace = searchText.lastIndexOf(" ");
  if (lastSpace !== -1) {
    return start + lastSpace + 1;
  }

  // No good break point found, use target position
  return targetPos;
}

/**
 * Split text into chunks of approximately equal size
 *
 * @param text - The text to chunk
 * @param options - Chunking configuration
 * @returns Array of text chunks with metadata
 */
export function chunkText(text: string, options: ChunkingOptions = {}): TextChunk[] {
  const {
    targetWords = CHUNKING_DEFAULTS.TARGET_WORDS,
    maxWords = CHUNKING_DEFAULTS.MAX_WORDS,
    minWords = CHUNKING_DEFAULTS.MIN_WORDS,
    overlapWords = CHUNKING_DEFAULTS.OVERLAP_WORDS,
    chapterId,
    chapterTitle,
  } = options;

  // Normalize whitespace
  const normalizedText = text.replace(/\r\n/g, "\n").trim();

  if (!normalizedText) {
    return [];
  }

  const totalWords = countWords(normalizedText);

  // If text is small enough, return as single chunk
  if (totalWords <= maxWords) {
    return [
      {
        index: 0,
        text: normalizedText,
        wordCount: totalWords,
        startOffset: 0,
        endOffset: normalizedText.length,
        chapterId,
        chapterTitle,
      },
    ];
  }

  const chunks: TextChunk[] = [];
  let currentPos = 0;
  let chunkIndex = 0;

  // Estimate characters per word for position calculations
  const charsPerWord = normalizedText.length / totalWords;
  const targetChars = Math.round(targetWords * charsPerWord);
  const overlapChars = Math.round(overlapWords * charsPerWord);
  const searchRange = Math.round(CHUNKING_DEFAULTS.BREAK_SEARCH_RANGE_WORDS * charsPerWord);

  while (currentPos < normalizedText.length) {
    const remainingText = normalizedText.slice(currentPos);
    const remainingWords = countWords(remainingText);

    // If remaining text is small enough, add as final chunk
    if (remainingWords <= maxWords) {
      chunks.push({
        index: chunkIndex,
        text: remainingText.trim(),
        wordCount: remainingWords,
        startOffset: currentPos,
        endOffset: normalizedText.length,
        chapterId,
        chapterTitle,
      });
      break;
    }

    // Find break point near target position
    const targetEndPos = currentPos + targetChars;
    const breakPos = findBreakPoint(normalizedText, targetEndPos, searchRange);

    // Extract chunk
    const chunkContent = normalizedText.slice(currentPos, breakPos).trim();
    const chunkWords = countWords(chunkContent);

    // Only add if chunk meets minimum size
    if (chunkWords >= minWords) {
      chunks.push({
        index: chunkIndex,
        text: chunkContent,
        wordCount: chunkWords,
        startOffset: currentPos,
        endOffset: breakPos,
        chapterId,
        chapterTitle,
      });
      chunkIndex++;
    }

    // Move position forward, accounting for overlap
    currentPos = Math.max(currentPos + 1, breakPos - overlapChars);
  }

  return chunks;
}

/**
 * Chunk text from multiple chapters, preserving chapter metadata
 *
 * @param chapters - Array of chapter objects with id, title, and text
 * @param options - Chunking configuration (applied per chapter)
 * @returns Array of chunks from all chapters
 */
export function chunkChapters(
  chapters: Array<{ id: string; title?: string; text: string }>,
  options: Omit<ChunkingOptions, "chapterId" | "chapterTitle"> = {},
): TextChunk[] {
  const allChunks: TextChunk[] = [];
  let globalIndex = 0;

  for (const chapter of chapters) {
    const chapterChunks = chunkText(chapter.text, {
      ...options,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
    });

    // Update indices to be globally unique
    for (const chunk of chapterChunks) {
      allChunks.push({
        ...chunk,
        index: globalIndex++,
      });
    }
  }

  return allChunks;
}

/**
 * Estimate the number of chunks that will be created
 *
 * @param totalWords - Total word count of the text
 * @param targetWords - Target words per chunk
 * @returns Estimated number of chunks
 */
export function estimateChunkCount(totalWords: number, targetWords = CHUNKING_DEFAULTS.TARGET_WORDS): number {
  // Single chunk if text is small (within 1.5x target)
  const SINGLE_CHUNK_THRESHOLD = 1.5;
  if (totalWords <= targetWords * SINGLE_CHUNK_THRESHOLD) {
    return 1;
  }
  // Account for overlap (roughly 10% per chunk)
  const OVERLAP_FACTOR = 0.9;
  return Math.ceil(totalWords / (targetWords * OVERLAP_FACTOR));
}
