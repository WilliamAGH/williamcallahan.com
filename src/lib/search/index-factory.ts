/**
 * Search Index Factory
 *
 * Generic MiniSearch index creation utilities.
 * Eliminates repetitive index instantiation boilerplate across all content types.
 *
 * @module lib/search/index-factory
 */

import MiniSearch from "minisearch";
import type { IndexFieldConfig } from "@/types/search";
import { prepareDocumentsForIndexing } from "@/lib/utils/search-helpers";

/**
 * Creates a MiniSearch index from configuration and documents.
 *
 * This factory function centralizes the repetitive pattern of:
 * 1. Creating a MiniSearch instance with configuration
 * 2. Deduplicating documents
 * 3. Adding documents to the index
 *
 * @template T - The document type being indexed (must have optional id field for deduplication)
 * @param config - Index field configuration
 * @param documents - Array of documents to index
 * @param sourceName - Name of the data source for logging
 * @param getIdField - Optional custom ID field extractor for deduplication
 * @returns Configured and populated MiniSearch index
 *
 * @example
 * ```typescript
 * import { INVESTMENTS_INDEX_CONFIG } from "./config";
 * import { investments } from "@/data/investments";
 *
 * const index = createIndex(
 *   INVESTMENTS_INDEX_CONFIG,
 *   investments,
 *   "Investments"
 * );
 * ```
 */
export function createIndex<T extends { id?: string | number }>(
  config: IndexFieldConfig<T>,
  documents: T[],
  sourceName: string,
  getIdField?: (doc: T) => string,
): MiniSearch<T> {
  // Build options object, only including extractField if defined
  const baseOptions = {
    fields: config.fields,
    storeFields: config.storeFields,
    idField: config.idField,
    searchOptions: {
      boost: config.boost as { [fieldName: string]: number } | undefined,
      fuzzy: config.fuzzy ?? 0.2,
      prefix: true,
    },
  };

  const index = config.extractField
    ? new MiniSearch<T>({ ...baseOptions, extractField: config.extractField })
    : new MiniSearch<T>(baseOptions);

  const deduped = prepareDocumentsForIndexing(documents, sourceName, getIdField);
  index.addAll(deduped);

  return index;
}

/**
 * Creates a MiniSearch index without automatic deduplication.
 * Use when documents are already deduplicated or when custom handling is needed.
 *
 * @template T - The document type being indexed
 * @param config - Index field configuration
 * @param documents - Array of documents to index (must be pre-deduplicated)
 * @returns Configured and populated MiniSearch index
 */
export function createIndexWithoutDedup<T>(
  config: IndexFieldConfig<T>,
  documents: T[],
): MiniSearch<T> {
  // Build options object, only including extractField if defined
  const baseOptions = {
    fields: config.fields,
    storeFields: config.storeFields,
    idField: config.idField,
    searchOptions: {
      boost: config.boost as { [fieldName: string]: number } | undefined,
      fuzzy: config.fuzzy ?? 0.2,
      prefix: true,
    },
  };

  const index = config.extractField
    ? new MiniSearch<T>({ ...baseOptions, extractField: config.extractField })
    : new MiniSearch<T>(baseOptions);

  index.addAll(documents);

  return index;
}
