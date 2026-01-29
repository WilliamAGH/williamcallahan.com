/**
 * Shared JSON Utilities
 *
 * Safe JSON parsing, stringification, and manipulation utilities
 * with proper error handling and type safety
 */

import type { ZodSchema } from "zod/v4";
import { debugLog } from "./debug";

/**
 * Safe JSON parse with optional Zod validation
 * Returns null if parsing fails or validation fails (when schema provided)
 *
 * @overload With schema - validates and returns typed result
 * @overload Without schema - returns unknown for caller to validate
 */
export function safeJsonParse<T>(text: string, schema: ZodSchema<T>): T | null;
export function safeJsonParse(text: string): unknown;
export function safeJsonParse<T>(text: string, schema?: ZodSchema<T>): T | unknown | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (schema) {
      const result = schema.safeParse(parsed);
      if (result.success) {
        return result.data;
      }
      debugLog(`JSON validation failed: ${result.error.message}`, "error", {
        preview: text.substring(0, 100),
      });
      return null;
    }
    return parsed;
  } catch (error) {
    debugLog(`Failed to parse JSON: ${(error as Error).message ?? "Unknown error"}`, "error", {
      preview: text.substring(0, 100),
    });
    return null;
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
    debugLog(
      `Failed to stringify JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
      "error",
    );
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
 * Deep clone an object using JSON methods with optional schema validation
 * Note: This will lose functions, undefined values, and symbols
 */
export function jsonClone<T>(obj: T, schema?: ZodSchema<T>): T | null {
  const stringified = safeJsonStringify(obj);
  if (!stringified) return null;

  if (schema) {
    return safeJsonParse(stringified, schema);
  }
  // Without schema, we trust the input type since we're cloning
  const parsed = safeJsonParse(stringified);
  return parsed as T | null;
}

/**
 * Parse JSON from Buffer or string with optional schema validation
 */
export function parseJsonFromBuffer<T>(
  data: Buffer | string,
  schema: ZodSchema<T>,
  encoding?: BufferEncoding,
): T | null;
export function parseJsonFromBuffer(data: Buffer | string, encoding?: BufferEncoding): unknown;
export function parseJsonFromBuffer<T>(
  data: Buffer | string,
  schemaOrEncoding?: ZodSchema<T> | BufferEncoding,
  encoding: BufferEncoding = "utf-8",
): T | unknown | null {
  const actualEncoding = typeof schemaOrEncoding === "string" ? schemaOrEncoding : encoding;
  const schema =
    typeof schemaOrEncoding === "object" && schemaOrEncoding !== null
      ? (schemaOrEncoding as ZodSchema<T>)
      : undefined;

  const text = Buffer.isBuffer(data) ? data.toString(actualEncoding) : data;
  if (schema) {
    return safeJsonParse(text, schema);
  }
  return safeJsonParse(text);
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
export function truncateJson(
  value: unknown,
  maxLength = 1000,
  placeholder = "...[truncated]",
): string {
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
