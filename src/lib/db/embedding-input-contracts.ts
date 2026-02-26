/**
 * Embedding Input Contracts — types, builder utility, and domain registry.
 *
 * This file + embedding-field-specs-{content,entities}.ts form the SINGLE SOURCE OF TRUTH
 * for what fields go into embedding text sent to Qwen3-Embedding-4B.
 * Every `build*EmbeddingInput()` function must follow these contracts.
 *
 * LABEL RULES (enforced by field specs):
 *   1. Every label must have exactly ONE interpretation.
 *   2. Use qualified nouns: "Company Name" not "Name".
 *   3. Same concept = same label across all domains.
 *   4. Metadata first, verbose body text last (truncation-safe).
 *   5. Banned as standalone labels: "type", "state", "stage", "domain",
 *      "content", "note", "status" — must always be qualified.
 *
 * @module lib/db/embedding-input-contracts
 */

import type { ContentEmbeddingDomain, EmbeddingFieldSpec } from "@/types/db/embeddings";
export type { EmbeddingFieldSpec } from "@/types/db/embeddings";
import {
  BLOG_POST_EMBEDDING_FIELDS,
  BOOK_EMBEDDING_FIELDS,
  BOOKMARK_EMBEDDING_FIELDS,
  THOUGHT_EMBEDDING_FIELDS,
} from "@/lib/db/embedding-field-specs-content";
import {
  AI_ANALYSIS_EMBEDDING_FIELDS,
  INVESTMENT_EMBEDDING_FIELDS,
  OPENGRAPH_EMBEDDING_FIELDS,
  PROJECT_EMBEDDING_FIELDS,
} from "@/lib/db/embedding-field-specs-entities";

/** Maps each content domain to its ordered embedding field specification. */
export const EMBEDDING_FIELD_CONTRACTS: Record<
  ContentEmbeddingDomain,
  readonly EmbeddingFieldSpec[]
> = {
  bookmark: BOOKMARK_EMBEDDING_FIELDS,
  thought: THOUGHT_EMBEDDING_FIELDS,
  investment: INVESTMENT_EMBEDDING_FIELDS,
  project: PROJECT_EMBEDDING_FIELDS,
  book: BOOK_EMBEDDING_FIELDS,
  blog: BLOG_POST_EMBEDDING_FIELDS,
  ai_analysis: AI_ANALYSIS_EMBEDDING_FIELDS,
  opengraph: OPENGRAPH_EMBEDDING_FIELDS,
};

// ─────────────────────────────────────────────────────────────────────────────
// BUILDER UTILITY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build embedding input text from a source record using a field contract.
 *
 * Iterates field specs in order. For each spec:
 *   - Resolves the value via `sourceKey` (supports dot-notation paths).
 *   - Skips fields with null, undefined, or empty-string values.
 *   - Writes `"Label: value\n"` to the output.
 *
 * Non-verbose fields come first (metadata). Verbose fields come last
 * (long body text). Contract arrays are pre-sorted by definition order.
 *
 * @param fields - Ordered field specs from EMBEDDING_FIELD_CONTRACTS.
 * @param source - Source data object (DB row or parsed API response).
 * @returns Newline-delimited string ready for the embedding model.
 */
export function buildEmbeddingText(
  fields: readonly EmbeddingFieldSpec[],
  source: Record<string, unknown>,
): string {
  const sections: string[] = [];

  for (const field of fields) {
    const value = resolveFieldValue(source, field.sourceKey);
    if (value === null || value === undefined) continue;

    const text = formatFieldValue(value);
    if (text.length === 0) continue;

    sections.push(`${field.label}: ${text}`);
  }

  return sections.join("\n");
}

function resolveFieldValue(source: Record<string, unknown>, keyPath: string): unknown {
  const parts = keyPath.split(".");
  let current: unknown = source;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return null;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function formatFieldValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    const items = value
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object" && "name" in item) {
          return String((item as { name: unknown }).name).trim();
        }
        return String(item).trim();
      })
      .filter((s) => s.length > 0);
    return items.join(", ");
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}
