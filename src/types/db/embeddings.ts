/**
 * Embedding types shared across schema definitions, mutations, and contracts.
 *
 * CONTENT_EMBEDDING_DOMAINS is the single source of truth for valid domain
 * values in the embeddings table. ContentEmbeddingDomain is the
 * union type derived from it. EmbeddingFieldSpec defines per-domain field
 * contracts for deterministic embedding text generation.
 */

/** Valid domain values for embeddings rows. */
export const CONTENT_EMBEDDING_DOMAINS = [
  "bookmark",
  "thought",
  "blog",
  "book",
  "investment",
  "project",
  "ai_analysis",
  "opengraph",
] as const;
export type ContentEmbeddingDomain = (typeof CONTENT_EMBEDDING_DOMAINS)[number];

/**
 * A single field in an embedding input text block.
 *
 * @property sourceKey    — Key path in the source data (dot notation for nested).
 * @property label        — Unambiguous label written into text as "Label: value\n".
 * @property meaning      — Developer-facing explanation (never shown to model).
 * @property required     — If true, must have a non-empty value.
 * @property verboseField — If true, can be very long; placed LAST for truncation safety.
 */
export interface EmbeddingFieldSpec {
  sourceKey: string;
  label: string;
  meaning: string;
  required: boolean;
  verboseField: boolean;
}
