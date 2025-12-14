/**
 * Search Types
 *
 * Public entrypoint for all search-related types and schemas.
 *
 * Zod schemas live in `@/types/schemas/search` (runtime validation source of truth).
 */

import type MiniSearch from "minisearch";
import type { AggregatedTag as AggregatedTagShape, SearchResult as SearchResultShape } from "./schemas/search";

// Re-export all types and schemas from the Zod schemas file (source of truth)
export {
  // Constants
  VALID_SCOPES,
  // Schemas
  validScopesSchema,
  searchScopeSchema,
  searchResultTypeSchema,
  bookmarkSearchParamsSchema,
  bookmarkIndexInputSchema,
  educationItemSchema,
  bookmarkIndexItemSchema,
  serializedIndexSchema,
  allSerializedIndexesSchema,
  tagContentTypeSchema,
  aggregatedTagSchema,
  searchResultSchema,
  searchResultsSchema,
  miniSearchStoredFieldsSchema,
  // Types (z.infer exports)
  type SearchScope,
  type SearchResultType,
  type BookmarkSearchParams,
  type BookmarkIndexInput,
  type EducationItem,
  type BookmarkIndexItem,
  type SerializedIndex,
  type AllSerializedIndexes,
  type TagContentType,
  type AggregatedTag,
  type SearchResult,
  type SearchResults,
  type MiniSearchStoredFields,
  type ScoredResult,
} from "./schemas/search";

// ─────────────────────────────────────────────────────────────────────────────
// Generic Interfaces (can't be Zod schemas due to TypeScript generics)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for a MiniSearch index.
 * Centralizes the repetitive MiniSearch options used across all index builders.
 *
 * @template T - The document type being indexed
 * @template VirtualFields - Optional virtual field names (extracted via extractField)
 */
export interface IndexFieldConfig<T, VirtualFields extends string = never> {
  /** Fields to index for searching (includes both document keys and virtual fields) */
  fields: ((keyof T & string) | VirtualFields)[];
  /** Fields to store in the index for retrieval */
  storeFields: (keyof T & string)[];
  /** Field to use as the document ID */
  idField: keyof T & string;
  /** Boost factors for specific fields (higher = more weight) */
  boost?: Partial<Record<(keyof T & string) | VirtualFields, number>>;
  /** Fuzzy matching tolerance (0-1, default 0.2) */
  fuzzy?: number;
  /** Custom field extraction function for complex fields (required when VirtualFields is set) */
  extractField?: (document: T, fieldName: string) => string;
}

/**
 * Configuration for creating a cached search function.
 * Used by the search factory to generate consistent search implementations.
 *
 * @template TDoc - The document type being searched
 * @template TResult - The search result type (extends SearchResult)
 */
export interface SearchFunctionConfig<TDoc, TResult extends SearchResultShape> {
  /** Cache key for storing/retrieving results */
  cacheKey: string;
  /** Function to retrieve or build the MiniSearch index */
  getIndex: () => Promise<MiniSearch<TDoc>>;
  /** Function to get the source documents */
  getItems: () => TDoc[] | Promise<TDoc[]>;
  /** Function to extract searchable text fields from a document */
  getSearchableFields: (item: TDoc) => (string | undefined | null)[];
  /** Optional function to get a field for exact matching */
  getExactMatchField?: (item: TDoc) => string;
  /** Optional function to extract the document ID */
  getItemId?: (item: TDoc) => string;
  /** Function to transform a matched document into a search result */
  transformResult: (item: TDoc, score: number) => TResult;
}

/**
 * Configuration for a tag source.
 * Used by the tag aggregator to collect tags from different content types.
 *
 * @template T - The item type containing tags
 */
export interface TagSource<T> {
  /** Items to extract tags from, or async function to get them */
  items: T[] | (() => Promise<T[]>);
  /** Function to extract tag strings from an item */
  getTags: (item: T) => string[] | undefined;
  /** Content type for the aggregated tags */
  contentType: AggregatedTagShape["contentType"];
  /** URL pattern generator for tag pages */
  urlPattern: (slug: string) => string;
}
