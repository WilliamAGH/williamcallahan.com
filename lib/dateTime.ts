/******************************************************************************
 * ************************************************************************* *
 * ***                        🚨 WARNING 🚨                               *** *
 * ***                                                                   *** *
 * ***   ALL DATES IN THIS SYSTEM ARE STORED IN PACIFIC TIME            *** *
 * ***   This file provides standardized formatting for display         *** *
 * ***                                                                   *** *
 * ************************************************************************* *
 ******************************************************************************/

export const PACIFIC_TIMEZONE = 'America/Los_Angeles';

/**
 * Convert a date to ISO format with Pacific timezone offset
 *
 * Input:
 * - Date-only strings (YYYY-MM-DD) -> append midnight PT
 * - ISO strings -> convert to PT
 * - Date objects -> convert to PT
 * - undefined -> current time in PT
 *
 * Output:
 * - Always includes correct timezone offset (-07:00 PDT or -08:00 PST)
 * - Examples:
 *   - "2024-10-24" -> "2024-10-24T00:00:00-08:00" (PST)
 *   - "2024-07-24" -> "2024-07-24T00:00:00-07:00" (PDT)
 */
export function toISO(date: string | Date | undefined): string {
  if (!date) {
    return nowPacific();
  }
  // If it's a Date object, convert to string
  const dateStr = date instanceof Date ? date.toISOString() : date;

  // For date-only strings, append midnight
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const d = new Date(dateStr + 'T00:00:00');
    const formatted = d.toLocaleString('en-US', {
      timeZone: PACIFIC_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'longOffset'
    });
    // Ensure midnight is always 00:00:00, not 24:00:00
    const withMidnight = formatted.replace(/24:00:00/, '00:00:00');
    return withMidnight.replace(/(\d+)\/(\d+)\/(\d+),\s(\d{2}:\d{2}:\d{2}).*?([-+]\d{2}:\d{2})/, '$3-$1-$2T$4$5');
  }

  // For ISO strings, convert to PT
  const d = new Date(dateStr);
  const formatted = d.toLocaleString('en-US', {
    timeZone: PACIFIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'longOffset'
  });
  // Ensure midnight is always 00:00:00, not 24:00:00
  const withMidnight = formatted.replace(/24:00:00/, '00:00:00');
  return withMidnight.replace(/(\d+)\/(\d+)\/(\d+),\s(\d{2}:\d{2}:\d{2}).*?([-+]\d{2}:\d{2})/, '$3-$1-$2T$4$5');
}

/**
 * Format a date for human display (e.g. "March 14, 2024")
 * If no date is provided, returns the current date in PT
 */
export function formatDisplay(date: string | Date | undefined): string {
  if (!date) {
    return new Date().toLocaleString('en-US', {
      timeZone: PACIFIC_TIMEZONE,
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
  return new Date(date).toLocaleString('en-US', {
    timeZone: PACIFIC_TIMEZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Sort dates in descending order (newest first)
 * All dates are already in PT, so simple comparison works
 */
export function sortDates(a: string, b: string): number {
  return new Date(b).getTime() - new Date(a).getTime();
}

/**
 * Compare two dates for equality
 */
export function datesAreEqual(a: string, b: string): boolean {
  return new Date(a).getTime() === new Date(b).getTime();
}

/**
 * Get current time in PT ISO format
 */
export function nowPacific(): string {
  const now = new Date();
  const formatted = now.toLocaleString('en-US', {
    timeZone: PACIFIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'longOffset'
  });
  // Ensure midnight is always 00:00:00, not 24:00:00
  const withMidnight = formatted.replace(/24:00:00/, '00:00:00');
  return withMidnight.replace(/(\d+)\/(\d+)\/(\d+),\s(\d{2}:\d{2}:\d{2}).*?([-+]\d{2}:\d{2})/, '$3-$1-$2T$4$5');
}

/**
 * Format a date for OpenGraph metadata
 * Preserves date-only format for publish dates, uses ISO for modified dates
 */
export function toOpenGraph(date: string | Date | undefined, type: 'published' | 'modified'): string {
  if (!date) {
    return nowPacific();
  }

  // For publish dates without time, preserve YYYY-MM-DD format
  if (type === 'published' && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  // For all other cases, use ISO format with timezone
  return toISO(date);
}

/**
 * Get current timestamp in milliseconds (Pacific Time)
 * Used for cache operations and timing comparisons
 */
export function timestamp(): number {
  return new Date().getTime();
}

/**
 * Parse a date string assuming Pacific timezone
 * Handles various formats and ensures consistent timezone interpretation
 */
export function parsePacificDate(dateStr: string): Date {
  const date = new Date(dateStr);
  return new Date(
    date.toLocaleString('en-US', {
      timeZone: PACIFIC_TIMEZONE
    })
  );
}

/**
 * Format a date as ISO string in Pacific timezone
 * Specifically for test scenarios requiring exact format matching
 */
export function formatISOPacific(date: Date): string {
  const formatted = date.toLocaleString('en-US', {
    timeZone: PACIFIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'longOffset'
  });
  // Ensure midnight is always 00:00:00, not 24:00:00
  const withMidnight = formatted.replace(/24:00:00/, '00:00:00');
  return withMidnight.replace(/(\d+)\/(\d+)\/(\d+),\s(\d{2}:\d{2}:\d{2}).*?([-+]\d{2}:\d{2})/, '$3-$1-$2T$4$5');
}
