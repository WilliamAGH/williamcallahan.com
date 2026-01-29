import { z } from "zod";

/**
 * Chroma Vector Store Schemas
 *
 * Zod schemas for validating Chroma Cloud configuration and document data.
 * These schemas provide type-safe validation for vector database operations.
 */

/**
 * Chroma Cloud connection configuration.
 * Validates credentials and connection parameters for CloudClient.
 */
export const ChromaCloudConfigSchema = z.object({
  /** API key for Chroma Cloud authentication */
  apiKey: z.string().min(1, "API key is required"),
  /** Tenant identifier (UUID format) */
  tenant: z.string().uuid("Tenant must be a valid UUID"),
  /** Database name for the connection */
  database: z.string().min(1, "Database name is required"),
  /** Optional custom host (defaults to api.trychroma.com) */
  host: z.string().optional(),
  /** Optional custom port (defaults to 443) */
  port: z.number().int().positive().optional(),
});

export type ChromaCloudConfig = z.infer<typeof ChromaCloudConfigSchema>;

/**
 * Sparse vector format used by Chroma for hybrid search.
 */
export const ChromaSparseVectorSchema = z.object({
  indices: z.array(z.number().int()),
  values: z.array(z.number()),
  tokens: z.array(z.string()).optional(),
});

export type ChromaSparseVector = z.infer<typeof ChromaSparseVectorSchema>;

/**
 * Metadata value - Chroma accepts boolean, number, string, null, or sparse vectors.
 */
export const ChromaMetadataValueSchema = z.union([
  z.boolean(),
  z.number(),
  z.string(),
  z.null(),
  ChromaSparseVectorSchema,
]);

export type ChromaMetadataValue = z.infer<typeof ChromaMetadataValueSchema>;

/**
 * Document metadata - key-value pairs for filtering and retrieval.
 */
export const ChromaMetadataSchema = z.record(z.string(), ChromaMetadataValueSchema);

export type ChromaMetadata = z.infer<typeof ChromaMetadataSchema>;

/**
 * Single document record for collection operations.
 */
export const ChromaDocumentSchema = z.object({
  /** Unique identifier for the document */
  id: z.string().min(1, "Document ID is required"),
  /** Optional pre-computed embedding vector */
  embedding: z.array(z.number()).optional(),
  /** Optional metadata for filtering */
  metadata: ChromaMetadataSchema.optional(),
  /** Optional document text content */
  document: z.string().optional(),
  /** Optional URI reference */
  uri: z.string().url().optional(),
});

export type ChromaDocument = z.infer<typeof ChromaDocumentSchema>;

/**
 * Include enum values for query results.
 */
export const ChromaIncludeSchema = z.enum([
  "distances",
  "documents",
  "embeddings",
  "metadatas",
  "uris",
]);

export type ChromaInclude = z.infer<typeof ChromaIncludeSchema>;

/**
 * Query parameters for similarity search.
 */
export const ChromaQueryParamsSchema = z
  .object({
    /** Query embedding vector (mutually exclusive with queryText) */
    queryEmbedding: z.array(z.number()).optional(),
    /** Query text - requires collection to have embedding function */
    queryText: z.string().optional(),
    /** Number of results to return (default: 10) */
    nResults: z.number().int().positive().default(10),
    /** Metadata filter conditions */
    where: z.record(z.string(), z.unknown()).optional(),
    /** Document content filter conditions */
    whereDocument: z.record(z.string(), z.unknown()).optional(),
    /** Fields to include in results */
    include: z.array(ChromaIncludeSchema).optional(),
  })
  .refine((data) => data.queryEmbedding !== undefined || data.queryText !== undefined, {
    message: "Either queryEmbedding or queryText is required",
  });

export type ChromaQueryParams = z.infer<typeof ChromaQueryParamsSchema>;

/**
 * Collection configuration for creation.
 */
export const ChromaCollectionConfigSchema = z.object({
  /** Collection name */
  name: z.string().min(1, "Collection name is required"),
  /** Optional collection metadata */
  metadata: ChromaMetadataSchema.optional(),
  /** Distance metric for similarity search */
  space: z.enum(["l2", "cosine", "ip"]).optional(),
});

export type ChromaCollectionConfig = z.infer<typeof ChromaCollectionConfigSchema>;

// =============================================================================
// BOOK CHUNK METADATA SCHEMA
// =============================================================================

/**
 * Schema for validating book chunk metadata from Chroma query results.
 * Matches the BookChunkMetadata interface in types/books/parsing.ts.
 *
 * This validates data at the Chroma query boundary - even though we index
 * well-formed metadata, query results come from an external database and
 * should be validated to catch schema drift or data corruption.
 */
export const bookChunkMetadataSchema = z.object({
  /** Book identifier (S3 key or UUID) */
  bookId: z.string(),
  /** Book title */
  title: z.string(),
  /** Book author */
  author: z.string(),
  /** ISBN if available (empty string if not) */
  isbn: z.string(),
  /** File type (pdf, epub) */
  fileType: z.string(),
  /** Chapter ID within the book */
  chapterId: z.string(),
  /** Chapter title if available */
  chapterTitle: z.string(),
  /** Chunk index within the book */
  chunkIndex: z.number().int().nonnegative(),
  /** Total chunks in the book */
  totalChunks: z.number().int().positive(),
  /** Word count of this chunk */
  wordCount: z.number().int().nonnegative(),
  /** Content type for cross-collection queries */
  contentType: z.literal("book-chunk"),
  /** Timestamp when indexed */
  indexedAt: z.string(),
  /** Subjects/genres as comma-separated string */
  subjects: z.string(),
  /** Publisher if available */
  publisher: z.string(),
  /** Publication date if available */
  publishedDate: z.string(),
  /** Language code (e.g., "en") */
  language: z.string(),
  /** Series name if part of a series */
  series: z.string(),
  /** Position in series (as string for Chroma compatibility) */
  seriesIndex: z.string(),
});

export type BookChunkMetadataFromSchema = z.infer<typeof bookChunkMetadataSchema>;
