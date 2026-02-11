#!/usr/bin/env bun
/**
 * Generate Consolidated Books Dataset (CLI Entry Point)
 *
 * Thin wrapper around the core generation library.
 * Run with: bun scripts/generate-books.ts
 *
 * S3 layout:
 *   json/books-{env}/latest.json          → pointer to current versioned snapshot
 *   json/books-{env}/{checksum}.json      → immutable versioned snapshot
 *   json/books-{env}/index.json           → metadata (count, checksum, timestamps)
 */

import { generateBooksDataset } from "@/lib/books/generate";

console.log("=== Generate Consolidated Books Dataset ===\n");

const result = await generateBooksDataset({});

if (result.success) {
  console.log("\n=== Summary ===");
  console.log(`Books: ${result.itemsProcessed ?? 0}`);
  console.log(`Changed: ${result.changeDetected ?? "N/A"}`);
  console.log(`Duration: ${result.duration?.toFixed(1)}s`);
  console.log("\n✅ Books dataset generation complete!");
} else {
  console.error(`\n✗ Generation failed: ${result.error}`);
  process.exit(1);
}
