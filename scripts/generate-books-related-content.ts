#!/usr/bin/env bun
/**
 * Generate Books Related Content
 *
 * Pre-computes related content similarity scores for all books and persists
 * the results to S3 for fast runtime lookups.
 *
 * Run with: bun scripts/generate-books-related-content.ts
 *
 * CRITICAL: All S3 writes use public-read ACL for CDN access.
 */

import { fetchBooks } from "@/lib/books/audiobookshelf.server";
import { generateBookSlug } from "@/lib/books/slug-helpers";
import { aggregateAllContent } from "@/lib/content-similarity/aggregator";
import { findMostSimilar } from "@/lib/content-similarity";
import { writeToS3 } from "@/lib/s3-utils";
import { CONTENT_GRAPH_S3_PATHS } from "@/lib/constants";
import type { NormalizedContent, RelatedContentEntry, BooksRelatedContentData } from "@/types/related-content";
import type { Book } from "@/types/schemas/book";

// Configuration
const MAX_RELATED_PER_BOOK = 12; // How many related items to compute per book
const CONTENT_TYPE = "book" as const;

/**
 * Normalize a book for similarity comparison
 * (Same logic as aggregator, but we need it here for the script)
 */
function normalizeBookForScript(book: Book): NormalizedContent {
  // Build text content from description, AI summary, and thoughts
  const textParts = [book.description, book.aiSummary, book.thoughts].filter(Boolean);
  const text = textParts.join(" ").slice(0, 1000);

  // Build tags from genres, authors, and publisher
  const baseTags: string[] = [...(book.genres || [])];
  if (book.authors) {
    baseTags.push(...book.authors);
  }
  if (book.publisher) {
    baseTags.push(book.publisher);
  }

  // Normalize tags to lowercase for consistent similarity
  const enhancedTags = Array.from(new Set(baseTags.map(t => t.toLowerCase().trim())));

  // Generate slug for URL
  const slug = generateBookSlug(book.title, book.id);

  // Parse published year to date
  const date = book.publishedYear ? new Date(`${book.publishedYear}-01-01`) : undefined;

  return {
    id: book.id,
    type: CONTENT_TYPE,
    title: book.title,
    text,
    tags: enhancedTags,
    url: `/books/${slug}`,
    domain: undefined,
    date,
    display: {
      description: book.description || book.aiSummary || "",
      imageUrl: book.coverUrl,
      book: {
        authors: book.authors,
        formats: book.formats,
        slug,
      },
    },
  };
}

async function main(): Promise<void> {
  console.log("=== Generate Books Related Content ===\n");

  // Step 1: Fetch books from AudioBookShelf
  console.log("Step 1: Fetching books from AudioBookShelf...");
  let books: Book[];
  try {
    books = await fetchBooks();
    console.log(`  ✓ Fetched ${books.length} books\n`);
  } catch (error) {
    console.error("  ✗ Failed to fetch books:", error);
    process.exit(1);
  }

  if (books.length === 0) {
    console.log("  ⚠ No books found. Exiting.");
    process.exit(0);
  }

  // Step 2: Aggregate all content for comparison
  console.log("Step 2: Aggregating all content for comparison...");
  let allContent: NormalizedContent[];
  try {
    allContent = await aggregateAllContent();
    console.log(`  ✓ Aggregated ${allContent.length} content items\n`);
  } catch (error) {
    console.error("  ✗ Failed to aggregate content:", error);
    process.exit(1);
  }

  // Step 3: Compute related content for each book
  console.log("Step 3: Computing related content for each book...");
  const entries: Record<string, RelatedContentEntry[]> = {};
  let processed = 0;

  for (const book of books) {
    const normalizedBook = normalizeBookForScript(book);
    const key = `${CONTENT_TYPE}:${book.id}`;

    // Find similar content (excluding the book itself and other books)
    const candidates = allContent.filter(item => !(item.type === CONTENT_TYPE && item.id === book.id));

    const similar = findMostSimilar(normalizedBook, candidates, MAX_RELATED_PER_BOOK);

    // Convert to simplified format for storage
    entries[key] = similar.map(item => ({
      type: item.type,
      id: item.id,
      score: Math.round(item.score * 1000) / 1000, // Round to 3 decimal places
      title: item.title,
    }));

    processed++;
    if (processed % 10 === 0 || processed === books.length) {
      console.log(`  Progress: ${processed}/${books.length} books processed`);
    }
  }

  console.log(`  ✓ Computed related content for ${processed} books\n`);

  // Step 4: Build output structure
  const output: BooksRelatedContentData = {
    version: "1.0.0",
    generated: new Date().toISOString(),
    booksCount: books.length,
    entries,
  };

  // Step 5: Write to S3 with public-read ACL
  console.log("Step 4: Writing to S3 with public-read ACL...");
  const s3Path = CONTENT_GRAPH_S3_PATHS.BOOKS_RELATED_CONTENT;

  try {
    const jsonData = JSON.stringify(output, null, 2);
    await writeToS3(s3Path, jsonData, "application/json", "public-read");
    console.log(`  ✓ Written to ${s3Path}`);
    console.log(`  ✓ ACL: public-read\n`);
  } catch (error) {
    console.error(`  ✗ Failed to write to S3:`, error);
    process.exit(1);
  }

  // Summary
  console.log("=== Summary ===");
  console.log(`Books processed: ${books.length}`);
  console.log(`S3 path: ${s3Path}`);
  console.log(`Generated at: ${output.generated}`);

  // Sample output for verification
  const sampleBook = Object.keys(entries)[0];
  if (sampleBook) {
    console.log(`\nSample entry (${sampleBook}):`);
    console.log(JSON.stringify(entries[sampleBook]?.slice(0, 3), null, 2));
  }

  console.log("\n✅ Books related content generation complete!");
}

main().catch((error: unknown) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
