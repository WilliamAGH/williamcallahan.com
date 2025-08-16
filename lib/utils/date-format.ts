/**
 * Date Formatting Utilities
 *
 * Centralized date formatting functions for consistent date handling
 *
 * @module lib/utils/date-format
 */

/**
 * Format date to Pacific timezone string
 * Used for displaying last updated timestamps
 */
export function formatPacificDateTime(date: Date = new Date()): string {
  return date.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}

/**
 * Get date for trailing year calculations
 * Returns a date exactly 365 days before the given date
 */
export function getTrailingYearDate(fromDate: Date = new Date()): Date {
  const trailingDate = new Date(fromDate);
  trailingDate.setDate(fromDate.getDate() - 365);
  return trailingDate;
}

/**
 * Set date to beginning of day (00:00:00.000)
 */
export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

/**
 * Set date to end of day (23:59:59.999)
 */
export function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setUTCHours(23, 59, 59, 999);
  return result;
}

/**
 * Format date as ISO date string (YYYY-MM-DD)
 */
export function formatISODate(date: Date): string {
  return date.toISOString().split("T")[0] || "";
}

/**
 * Convert Unix timestamp to Date
 */
export function unixToDate(timestamp: number): Date {
  return new Date(timestamp * 1000);
}

/**
 * Check if date is within range
 */
export function isDateInRange(date: Date, start: Date, end: Date): boolean {
  return date >= start && date <= end;
}
