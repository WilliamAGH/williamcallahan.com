/**
 * Search Query Validation Utilities
 *
 * Normalizes search queries: length cap, whitespace collapse, edge punctuation
 * trim, lowercase. Punctuation inside the query is kept because PostgreSQL
 * indexes tokens like "next.js" whole, and no consumer compiles the query
 * into a regular expression.
 */

import { VALID_SCOPES, type SearchQueryValidationResult } from "@/types/schemas/search";

/**
 * Validates and normalizes a search query.
 *
 * @param query - The raw search query
 * @returns Object with sanitized query and validation status
 */
export function validateSearchQuery(query: unknown): SearchQueryValidationResult {
  // Check if query exists and is a string
  if (!query || typeof query !== "string") {
    return {
      isValid: false,
      sanitized: "",
      error: "Query must be a non-empty string",
    };
  }

  // Trim and check length
  const trimmed = query.trim();

  if (trimmed.length === 0) {
    return {
      isValid: false,
      sanitized: "",
      error: "Query cannot be empty",
    };
  }

  const MAX_QUERY_LENGTH = 100;
  if (trimmed.length > MAX_QUERY_LENGTH) {
    return {
      isValid: false,
      sanitized: "",
      error: "Query is too long (max 100 characters)",
    };
  }

  // Collapse whitespace runs to a single space
  let sanitized = trimmed.replace(/\s+/g, " ");

  // Remove leading/trailing special characters (Unicode-aware)
  sanitized = sanitized.replace(/^[^\p{L}\p{N}\p{M}_]+|[^\p{L}\p{N}\p{M}_]+$/gu, "");

  // Final check after sanitization
  if (sanitized.length === 0) {
    return {
      isValid: false,
      sanitized: "",
      error: "Query contains only special characters",
    };
  }

  return {
    isValid: true,
    sanitized: sanitized.toLowerCase(),
  };
}

/**
 * Simple sanitization function for use in search functions
 * Returns empty string if invalid, sanitized query if valid
 */
export function sanitizeSearchQuery(query: string): string {
  const result = validateSearchQuery(query);
  return result.isValid ? result.sanitized : "";
}

/**
 * All valid scopes including "all" for site-wide search
 * Derived from VALID_SCOPES (single source of truth in types/search.ts)
 */
const ALL_VALID_SCOPES = [...VALID_SCOPES, "all"] as const;

/**
 * Validates search scope parameter
 */
export function SearchScopeValidator(scope: unknown): {
  isValid: boolean;
  scope?: string;
  error?: string;
} {
  if (typeof scope !== "string") {
    return {
      isValid: false,
      error: "Scope must be a string",
    };
  }

  const normalizedScope = scope.toLowerCase();
  if (!ALL_VALID_SCOPES.includes(normalizedScope as (typeof ALL_VALID_SCOPES)[number])) {
    return {
      isValid: false,
      error: `Invalid scope. Valid scopes are: ${ALL_VALID_SCOPES.join(", ")}`,
    };
  }

  return {
    isValid: true,
    scope: normalizedScope,
  };
}
