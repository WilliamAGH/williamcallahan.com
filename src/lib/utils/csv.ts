/**
 * CSV Utility Functions
 *
 * Generic CSV parsing and generation utilities for consistent CSV handling
 *
 * @module lib/utils/csv
 */

import type { CSVParseOptions, CSVLine } from "@/types/csv";

/**
 * Parse CSV string into array of objects or arrays
 */
export function parseCSV<T = CSVLine>(csvString: string, options: CSVParseOptions = {}): T[] {
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
      // Generic CSV parser: callers are responsible for providing a compatible T
      const untypedValues: unknown = values;
      results.push(untypedValues as T);
    }
  }

  return results;
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
/** CSV column indices for GitHub stats (week, additions, deletions, commits) */
const DELETIONS_INDEX = 2;
const COMMITS_INDEX = 3;

export function parseGitHubStatsCSV(csvString: string): Array<{
  w: number;
  a: number;
  d: number;
  c: number;
}> {
  return parseCSV<string[]>(csvString, { headers: false }).map((row) => ({
    w: Number(row[0]) || 0,
    a: Number(row[1]) || 0,
    d: Number(row[DELETIONS_INDEX]) || 0,
    c: Number(row[COMMITS_INDEX]) || 0,
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
