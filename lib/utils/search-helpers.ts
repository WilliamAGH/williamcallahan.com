/**
 * Search Helper Utilities
 *
 * Utility functions for search functionality including deduplication
 * and data normalization
 *
 * @module utils/search-helpers
 */

/**
 * Deduplicates an array of documents by a unique identifier field
 *
 * @template T - Document type that must have an id property
 * @param documents - Array of documents to deduplicate
 * @param getIdField - Function to extract the ID field from a document (defaults to doc.id)
 * @returns Array of deduplicated documents (first occurrence kept)
 *
 * @example
 * const docs = [
 *   { id: '1', title: 'First' },
 *   { id: '2', title: 'Second' },
 *   { id: '1', title: 'Duplicate' }
 * ];
 * const deduped = dedupeDocuments(docs); // Returns first two items
 *
 * @example
 * // Custom ID field extraction
 * const posts = [
 *   { slug: 'post-1', title: 'First Post' },
 *   { slug: 'post-2', title: 'Second Post' },
 *   { slug: 'post-1', title: 'Duplicate Post' }
 * ];
 * const deduped = dedupeDocuments(posts, (post) => post.slug);
 */
export function dedupeDocuments<T extends { id?: string | number }>(
  documents: T[],
  getIdField: (doc: T) => string = doc => String(doc.id ?? ""),
): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  const duplicates: string[] = [];

  for (const doc of documents) {
    const id = getIdField(doc);

    if (!id) {
      console.warn("[Search] Document with missing ID detected and skipped");
      continue;
    }

    if (!seen.has(id)) {
      seen.add(id);
      deduped.push(doc);
    } else {
      duplicates.push(id);
    }
  }

  if (duplicates.length > 0) {
    console.warn(
      `[Search] ${duplicates.length} duplicate ID(s) detected and skipped:`,
      duplicates.slice(0, 10).join(", "),
      duplicates.length > 10 ? `... and ${duplicates.length - 10} more` : "",
    );
  }

  return deduped;
}

/**
 * Validates and deduplicates documents before indexing
 * Logs statistics about the deduplication process
 *
 * @template T - Document type
 * @param documents - Array of documents to process
 * @param sourceName - Name of the data source for logging
 * @param getIdField - Function to extract the ID field
 * @returns Deduplicated array of documents
 */
export function prepareDocumentsForIndexing<T extends { id?: string | number }>(
  documents: T[],
  sourceName: string,
  getIdField?: (doc: T) => string,
): T[] {
  const originalCount = documents.length;
  const deduped = dedupeDocuments(documents, getIdField);
  const dedupedCount = deduped.length;

  if (originalCount !== dedupedCount) {
    console.log(
      `[Search] ${sourceName}: Deduplicated ${originalCount} documents to ${dedupedCount} (removed ${originalCount - dedupedCount} duplicates)`,
    );
  }

  return deduped;
}
