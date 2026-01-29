/**
 * CSV Utility Functions
 *
 * Generic CSV parsing and generation utilities for consistent CSV handling
 *
 * @module lib/utils/csv
 */

import type { CSVParseOptions, CSVRow } from "@/types/csv";

/**
 * Parse CSV string into array of objects or arrays
 */
export function parseCSV<T = CSVRow>(csvString: string, options: CSVParseOptions = {}): T[] {
  const { delimiter = ",", skipEmpty = true, maxRows, headers = false } = options;

  const lines = csvString
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !skipEmpty || line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const results: T[] = [];
  const headerRow = headers && lines[0] ? lines[0].split(delimiter) : null;
  const startIndex = headers ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    if (maxRows && results.length >= maxRows) {
      break;
    }

    const line = lines[i];
    if (!line) continue;
    const values = line.split(delimiter);

    if (headers && headerRow) {
      // Return as object with headers as keys
      const row: Record<string, string> = {};
      headerRow.forEach((header, index) => {
        row[header] = values[index] || "";
      });
      results.push(row as T);
    } else {
      // Return as array
      results.push(values as unknown as T);
    }
  }

  return results;
}

/**
 * Generate CSV string from array of objects or arrays
 */
export function generateCSV<T>(
  data: T[],
  options: {
    delimiter?: string;
    headers?: string[];
    includeHeaders?: boolean;
  } = {},
): string {
  const { delimiter = ",", headers, includeHeaders = true } = options;

  if (data.length === 0) {
    return "";
  }

  const lines: string[] = [];

  // Add headers if provided
  if (headers && includeHeaders) {
    lines.push(headers.join(delimiter));
  }

  // Add data rows
  for (const row of data) {
    if (Array.isArray(row)) {
      lines.push(row.join(delimiter));
    } else if (typeof row === "object" && row !== null) {
      // If headers are provided, use them to determine order
      if (headers) {
        const values = headers.map((header) => {
          const value = (row as Record<string, unknown>)[header];
          // Handle null/undefined
          if (value == null) return "";
          // Handle objects and arrays by JSON stringification
          if (typeof value === "object") {
            return JSON.stringify(value);
          }
          // Convert primitives to string - explicit type checking to avoid base-to-string warning
          if (
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean"
          ) {
            return String(value);
          }
          // Fallback for other types (like symbols, functions, etc.)
          return JSON.stringify(value);
        });
        lines.push(values.join(delimiter));
      } else {
        // Use object keys
        const values = Object.values(row).map((v) => {
          // Handle null/undefined
          if (v == null) return "";
          // Handle objects and arrays by JSON stringification
          if (typeof v === "object") {
            return JSON.stringify(v);
          }
          // Convert primitives to string
          return String(v);
        });
        lines.push(values.join(delimiter));
      }
    }
  }

  return lines.join("\n");
}

/**
 * Validate CSV data for common issues
 */
export function validateCSV(
  csvString: string,
  expectedColumns?: number,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const lines = csvString.split("\n").filter((line) => line.trim());

  if (lines.length === 0) {
    errors.push("CSV is empty");
    return { valid: false, errors };
  }

  // Check column consistency
  const columnCounts = new Set<number>();
  lines.forEach((line, index) => {
    const columns = line.split(",").length;
    columnCounts.add(columns);

    if (expectedColumns && columns !== expectedColumns) {
      errors.push(`Line ${index + 1} has ${columns} columns, expected ${expectedColumns}`);
    }
  });

  if (columnCounts.size > 1 && !expectedColumns) {
    errors.push(`Inconsistent column counts: ${Array.from(columnCounts).join(", ")}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Parse GitHub weekly stats CSV format
 * Format: w,a,d,c (week timestamp, additions, deletions, commits)
 */
export function parseGitHubStatsCSV(csvString: string): Array<{
  w: number;
  a: number;
  d: number;
  c: number;
}> {
  return parseCSV<string[]>(csvString, { headers: false }).map((row) => ({
    w: Number(row[0]) || 0,
    a: Number(row[1]) || 0,
    d: Number(row[2]) || 0,
    c: Number(row[3]) || 0,
  }));
}

/**
 * Generate GitHub weekly stats CSV
 */
export function generateGitHubStatsCSV(
  stats: Array<{ w: number; a: number; d: number; c: number }>,
): string {
  return stats.map((stat) => `${stat.w},${stat.a},${stat.d},${stat.c}`).join("\n");
}
