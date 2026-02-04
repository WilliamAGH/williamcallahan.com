/**
 * Search Index Serialization Utilities
 *
 * Helpers for serializing MiniSearch indexes and extracting data
 * from serialized index formats.
 *
 * @module lib/search/serialization
 */

import type MiniSearch from "minisearch";
import type { SerializedIndex, BookmarkIndexItem, MiniSearchStoredFields } from "@/types/search";

/**
 * Type guard to check if value is a non-null object (record).
 *
 * @param v - Value to check
 * @returns True if value is a non-null object
 */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * Creates a SerializedIndex from a MiniSearch instance.
 * Centralizes the return pattern used in all build-time index functions.
 *
 * @param index - The MiniSearch index to serialize
 * @param itemCount - Number of items in the index
 * @returns SerializedIndex with metadata
 *
 * @example
 * ```typescript
 * const index = createIndex(config, documents, "Source");
 * const serialized = serializeIndex(index, documents.length);
 * await uploadToS3(serialized);
 * ```
 */
export function serializeIndex<T>(index: MiniSearch<T>, itemCount: number): SerializedIndex {
  return {
    index: index.toJSON(),
    metadata: {
      itemCount,
      buildTime: new Date().toISOString(),
      version: "1.0",
    },
  };
}

/**
 * Parses the index object from a SerializedIndex.
 * Handles both string (JSON) and pre-parsed object formats.
 *
 * @param serializedIndex - The serialized index to parse
 * @returns Parsed index object or null if parsing fails
 */
export function parseSerializedIndexObject(
  serializedIndex: SerializedIndex,
): Record<string, unknown> | null {
  if (typeof serializedIndex.index === "string") {
    try {
      const parsed: unknown = JSON.parse(serializedIndex.index);
      if (isRecord(parsed)) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }
  return isRecord(serializedIndex.index) ? serializedIndex.index : null;
}

/**
 * Extracts bookmark data from a serialized MiniSearch index.
 * Used as a fallback when live bookmark data is unavailable but S3 index exists.
 *
 * @param serializedIndex - The serialized bookmarks index
 * @returns Array of reconstructed bookmark items with slugs
 */
export function extractBookmarksFromSerializedIndex(
  serializedIndex: SerializedIndex,
): Array<BookmarkIndexItem & { slug: string }> {
  const indexObject = parseSerializedIndexObject(serializedIndex);
  if (!indexObject) {
    return [];
  }

  const documentIdsRaw = (indexObject as { documentIds?: unknown }).documentIds;
  const storedFieldsRaw = (indexObject as { storedFields?: unknown }).storedFields;

  if (!isRecord(documentIdsRaw) || !isRecord(storedFieldsRaw)) {
    return [];
  }

  const bookmarks: Array<BookmarkIndexItem & { slug: string }> = [];
  for (const [shortId, docId] of Object.entries(documentIdsRaw)) {
    const stored = storedFieldsRaw[shortId];
    if (!isRecord(stored)) continue;

    const storedFields = stored as MiniSearchStoredFields;
    const id =
      typeof storedFields.id === "string"
        ? storedFields.id
        : typeof docId === "string"
          ? docId
          : typeof docId === "number"
            ? String(docId)
            : null;
    const slug = typeof storedFields.slug === "string" ? storedFields.slug : null;

    if (!id || !slug) continue;

    const title =
      typeof storedFields.title === "string" && storedFields.title.length > 0
        ? storedFields.title
        : typeof storedFields.url === "string" && storedFields.url.length > 0
          ? storedFields.url
          : slug;

    bookmarks.push({
      id,
      title,
      description: typeof storedFields.description === "string" ? storedFields.description : "",
      summary: "",
      tags: "",
      url: typeof storedFields.url === "string" ? storedFields.url : "",
      author: "",
      publisher: "",
      slug,
    });
  }

  return bookmarks;
}
