/**
 * Test script to fetch actual books and verify OG image URLs
 * Run with: bun scripts/test-book-og.ts
 */

import { fetchBooks } from "@/lib/books/audiobookshelf.server";
import { generateBookSlug } from "@/lib/books/slug-helpers";

async function main() {
  try {
    const books = await fetchBooks();
    console.log(`Found ${books.length} books\n`);

    // Show first 3 books with their data and OG URLs
    for (const book of books.slice(0, 3)) {
      const slug = generateBookSlug(book.title, book.id, book.authors, book.isbn13, book.isbn10);

      // Build OG image URL (same logic as in page.tsx)
      const params = new URLSearchParams();
      params.set("title", book.title);
      if (book.authors?.length) {
        params.set("author", book.authors.join(", "));
      }
      if (book.coverUrl) {
        params.set("coverUrl", book.coverUrl);
      }
      if (book.formats?.length) {
        params.set("formats", book.formats.join(","));
      }
      const ogUrl = `/api/og/books?${params.toString()}`;

      console.log("═".repeat(80));
      console.log("Title:", book.title);
      console.log("Author:", book.authors?.join(", ") || "Unknown");
      console.log("Formats:", book.formats?.join(", ") || "none");
      console.log("Book Route:", `/books/${slug}`);
      console.log("");
      console.log("Full Cover URL:");
      console.log(book.coverUrl || "NONE");
      console.log("");
      console.log("Full OG Image URL:");
      console.log(`http://localhost:3000${ogUrl}`);
      console.log("");
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
