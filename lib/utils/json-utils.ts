/**
 * Shared JSON Utilities
 *
 * Safe JSON parsing, stringification, and manipulation utilities
 * with proper error handling and type safety
 */

import { debugLog } from "./debug";

/**
 * Safe JSON parse with error handling
 * Returns null if parsing fails instead of throwing
 */
export function safeJsonParse<T = unknown>(text: string, fallback: T | null = null): T | null {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    debugLog(`Failed to parse JSON: ${(error as Error).message ?? "Unknown error"}`, "error", {
      preview: text.substring(0, 100),
    });
    return fallback;
  }
}

/**
 * Safe JSON stringify with circular reference handling
 */
export function safeJsonStringify(
  value: unknown,
  space?: string | number,
  replacer?: (key: string, value: unknown) => unknown,
): string | null {
  try {
    const seen = new WeakSet();

    // Create internal replacer that handles both circular refs and custom replacer
    const internalReplacer = (key: string, val: unknown): unknown => {
      // Handle circular references
      if (typeof val === "object" && val !== null) {
        // Type guard for WeakKey compatibility
        if (typeof val === "object" || typeof val === "function") {
          if (seen.has(val as WeakKey)) {
            return "[Circular]";
          }
          seen.add(val as WeakKey);
        }
      }

      // Apply custom replacer if provided
      if (replacer) {
        return replacer(key, val);
      }
      return val;
    };

    return JSON.stringify(value, internalReplacer, space);
  } catch (error) {
    debugLog(`Failed to stringify JSON: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
    return null;
  }
}

/**
 * Pretty print JSON for development/debugging
 */
export function prettyJson(value: unknown, indent = 2): string {
  const stringified = safeJsonStringify(value, indent);
  return stringified ?? "[Unable to stringify]";
}

/**
 * Deep clone an object using JSON methods
 * Note: This will lose functions, undefined values, and symbols
 */
export function jsonClone<T>(obj: T): T | null {
  const stringified = safeJsonStringify(obj);
  if (!stringified) return null;

  return safeJsonParse<T>(stringified);
}

/**
 * Parse JSON from Buffer or string
 */
export function parseJsonFromBuffer<T = unknown>(data: Buffer | string, encoding: BufferEncoding = "utf-8"): T | null {
  const text = Buffer.isBuffer(data) ? data.toString(encoding) : data;
  return safeJsonParse<T>(text);
}

/**
 * Check if a string is valid JSON
 */
export function isValidJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract JSON from a mixed text (e.g., logs with embedded JSON)
 * Finds and returns the first valid JSON object or array
 */
export function extractJsonFromText(text: string): unknown {
  // Try to find JSON object
  const objectMatch = text.match(/\{[^{}]*\}/);
  if (objectMatch) {
    const parsed = safeJsonParse(objectMatch[0]);
    if (parsed !== null) return parsed;
  }

  // Try to find JSON array
  const arrayMatch = text.match(/\[[^[\]]*\]/);
  if (arrayMatch) {
    const parsed = safeJsonParse(arrayMatch[0]);
    if (parsed !== null) return parsed;
  }

  return null;
}

/**
 * Merge two JSON objects deeply
 * Arrays are replaced, not merged
 */
export function mergeJson<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === "object" &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === "object" &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      // Recursively merge objects
      result[key] = mergeJson(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>,
      ) as T[Extract<keyof T, string>];
    } else if (sourceValue !== undefined) {
      // Replace primitive values and arrays
      result[key] = sourceValue as T[Extract<keyof T, string>];
    }
  }

  return result;
}

/**
 * Get the size of a JSON string in bytes
 */
export function getJsonSizeInBytes(value: unknown): number {
  const stringified = safeJsonStringify(value);
  if (!stringified) return 0;

  return new Blob([stringified]).size;
}

/**
 * Truncate large JSON objects for logging
 * Useful for debugging without flooding logs
 */
export function truncateJson(value: unknown, maxLength = 1000, placeholder = "...[truncated]"): string {
  const stringified = safeJsonStringify(value, 2);
  if (!stringified) return "[Unable to stringify]";

  if (stringified.length <= maxLength) {
    return stringified;
  }

  return stringified.substring(0, maxLength - placeholder.length) + placeholder;
}

/**
 * Type guard to check if value is a plain object
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    value.constructor === Object &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

/**
 * Sort object keys recursively for consistent JSON output
 * Useful for caching and comparison
 */
export function sortJsonKeys<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map(sortJsonKeys) as T;
  }

  if (!isPlainObject(obj)) {
    return obj;
  }

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj).toSorted();

  for (const key of keys) {
    sorted[key] = sortJsonKeys((obj as Record<string, unknown>)[key]);
  }

  return sorted as T;
}

/**
 * Create a stable JSON string for comparison/hashing
 * Sorts keys and uses consistent formatting
 */
export function stableJsonStringify(value: unknown): string | null {
  const sorted = sortJsonKeys(value);
  return safeJsonStringify(sorted, 0);
}
