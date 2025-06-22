/**
 * Search Query Validation Utilities
 *
 * Provides validation and sanitization for search queries to prevent
 * ReDoS attacks and ensure safe processing.
 */

/**
 * Validates and sanitizes a search query to prevent ReDoS attacks
 * and ensure safe processing.
 *
 * @param query - The raw search query
 * @returns Object with sanitized query and validation status
 */
export function validateSearchQuery(query: unknown): {
  isValid: boolean;
  sanitized: string;
  error?: string;
} {
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

  if (trimmed.length > 100) {
    return {
      isValid: false,
      sanitized: "",
      error: "Query is too long (max 100 characters)",
    };
  }

  // Remove or escape potentially dangerous regex characters
  // This prevents ReDoS attacks from malicious regex patterns
  let sanitized = trimmed.replace(/[.*+?^${}()|[\]\\]/g, " ");

  // Replace multiple consecutive spaces with single space
  sanitized = sanitized.replace(/\s+/g, " ");

  // Remove leading/trailing special characters
  sanitized = sanitized.replace(/^[^\w]+|[^\w]+$/g, "");

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

  const validScopes = ["blog", "posts", "investments", "experience", "education", "bookmarks", "projects", "all"];

  if (!validScopes.includes(scope.toLowerCase())) {
    return {
      isValid: false,
      error: `Invalid scope. Valid scopes are: ${validScopes.join(", ")}`,
    };
  }

  return {
    isValid: true,
    scope: scope.toLowerCase(),
  };
}
