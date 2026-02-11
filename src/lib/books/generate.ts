/**
 * Books Dataset Generation
 * @module lib/books/generate
 * @description
 * Core generation logic for the consolidated books dataset.
 * Fetches all books from AudioBookShelf, merges manual enrichments and cached
 * AI summaries, generates blur placeholders, and persists to S3 with versioning.
 *
 * Used by:
 * - scripts/generate-books.ts (CLI entry point)
 * - DataFetchManager (automated pipeline via dynamic import)
 */

import { createHash } from "node:crypto";
import { fetchBooks } from "@/lib/books/audiobookshelf.server";
import { buildDirectCoverUrl } from "@/lib/books/transforms";
import { applyBookCoverBlurs } from "@/lib/books/image-utils.server";
import { getCachedAnalysis } from "@/lib/ai-analysis/reader.server";
import { readJsonS3Optional, writeJsonS3 } from "@/lib/s3/json";
import { BOOKS_S3_PATHS } from "@/lib/constants";
import { bookEnrichments } from "@/data/book-enrichments";
import { safeJsonStringify } from "@/lib/utils/json-utils";
import { booksLatestSchema } from "@/types/schemas/book";
import { bookAiAnalysisResponseSchema } from "@/types/schemas/book-ai-analysis";
import { getMonotonicTime } from "@/lib/utils";
import logger from "@/lib/utils/logger";
import type { Book, BooksDataset } from "@/types/schemas/book";
import type { DataFetchConfig, DataFetchOperationSummary } from "@/types/lib";

function getAbsConfig(): { baseUrl: string; apiKey: string } {
  const baseUrl = process.env.AUDIOBOOKSHELF_URL;
  const apiKey = process.env.AUDIOBOOKSHELF_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("AUDIOBOOKSHELF_URL and AUDIOBOOKSHELF_API_KEY are required");
  }
  return { baseUrl, apiKey };
}

/**
 * Generate consolidated books dataset and persist to S3.
 *
 * Orchestrates the full pipeline: ABS fetch → enrichment merge → AI summaries →
 * blur placeholders → checksum-gated S3 write. Returns a standardized
 * DataFetchOperationSummary for pipeline integration.
 */
export async function generateBooksDataset(
  config: DataFetchConfig,
): Promise<DataFetchOperationSummary> {
  const startTime = getMonotonicTime();
  void config;
  logger.info("[BooksGenerator] Starting books dataset generation...");

  try {
    // Step 1: Fetch books from AudioBookShelf
    logger.info("[BooksGenerator] Fetching books from AudioBookShelf...");
    const books: Book[] = await fetchBooks();
    logger.info(`[BooksGenerator] Fetched ${books.length} books`);

    if (books.length === 0) {
      logger.info("[BooksGenerator] No books found — nothing to generate");
      return {
        success: true,
        operation: "books",
        itemsProcessed: 0,
        duration: (getMonotonicTime() - startTime) / 1000,
      };
    }

    // Step 2: Merge manual enrichments (strip registry-only `slug` field before merge)
    let enrichedCount = 0;
    for (const book of books) {
      const entry = bookEnrichments[book.id];
      if (entry) {
        // Omit registry-only `slug` field — only merge enrichment data into Book
        const enrichmentFields = Object.fromEntries(
          Object.entries(entry).filter(([key]) => key !== "slug"),
        );
        if (Object.keys(enrichmentFields).length > 0) {
          Object.assign(book, enrichmentFields);
          enrichedCount++;
        }
      }
    }
    logger.info(`[BooksGenerator] ${enrichedCount} books enriched with manual data`);

    // Step 3: Merge cached AI summaries
    let aiCount = 0;
    for (const book of books) {
      try {
        const cached = await getCachedAnalysis("books", book.id);
        if (cached?.analysis) {
          const parsed = bookAiAnalysisResponseSchema.safeParse(cached.analysis);
          if (parsed.success) {
            if (parsed.data.summary && !book.aiSummary) {
              book.aiSummary = parsed.data.summary;
              aiCount++;
            }
          } else {
            logger.warn(
              `[BooksGenerator] AI analysis for ${book.id} failed validation: ${parsed.error.message}`,
            );
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`[BooksGenerator] AI summary fetch failed for ${book.id}: ${message}`);
      }
    }
    logger.info(`[BooksGenerator] ${aiCount} books enriched with AI summaries`);

    // Step 4: Generate blur placeholders
    try {
      const { baseUrl, apiKey } = getAbsConfig();
      const buildCoverUrl = (id: string) => buildDirectCoverUrl(id, baseUrl, apiKey);
      await applyBookCoverBlurs(books, buildCoverUrl);
      const withBlur = books.filter((b) => b.coverBlurDataURL).length;
      logger.info(`[BooksGenerator] ${withBlur}/${books.length} books with blur placeholders`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[BooksGenerator] Blur generation failed (non-fatal): ${message}`);
    }

    // Step 5: Compute checksum and check for changes
    const booksJson = safeJsonStringify(books);
    if (!booksJson) {
      throw new Error("Failed to serialize books dataset");
    }
    const checksum = createHash("sha256").update(booksJson).digest("hex").slice(0, 12);

    const existingLatest = await readJsonS3Optional(BOOKS_S3_PATHS.LATEST, booksLatestSchema);
    if (existingLatest?.checksum === checksum) {
      logger.info(`[BooksGenerator] Checksum unchanged (${checksum}) — skipping S3 write`);
      return {
        success: true,
        operation: "books",
        itemsProcessed: books.length,
        changeDetected: false,
        duration: (getMonotonicTime() - startTime) / 1000,
      };
    }

    // Step 6: Write versioned snapshot to S3
    const generated = new Date().toISOString();
    const snapshotKey = `${BOOKS_S3_PATHS.DIR}/${checksum}.json`;

    const dataset: BooksDataset = {
      version: "1.0.0",
      generated,
      booksCount: books.length,
      checksum,
      books,
    };

    await writeJsonS3(snapshotKey, dataset);
    await writeJsonS3(BOOKS_S3_PATHS.LATEST, { checksum, key: snapshotKey, generated });
    await writeJsonS3(BOOKS_S3_PATHS.INDEX, {
      count: books.length,
      checksum,
      lastModified: generated,
      lastFetchedAt: Date.now(),
    });

    logger.info(
      `[BooksGenerator] Dataset written to S3 — ${books.length} books, checksum ${checksum}`,
    );

    return {
      success: true,
      operation: "books",
      itemsProcessed: books.length,
      changeDetected: true,
      duration: (getMonotonicTime() - startTime) / 1000,
    };
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    logger.error("[BooksGenerator] Books dataset generation failed:", error);
    return {
      success: false,
      operation: "books",
      error: error.message,
      duration: (getMonotonicTime() - startTime) / 1000,
    };
  }
}
