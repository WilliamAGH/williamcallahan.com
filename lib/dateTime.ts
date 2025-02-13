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
/**
 * Format a date for human display with different format options
 * If no date is provided, returns the current date in PT
 */
export function formatDisplay(
  date: string | Date | undefined,
  format: 'full' | 'year' = 'full'
): string {
  // For year-only strings or period strings (e.g., "2023" or "2023 - Present"), return as-is
  if (typeof date === 'string') {
    // Match YYYY format
    if (/^\d{4}$/.test(date)) {
      return date;
    }
    // Match YYYY - YYYY or YYYY - Present format
    if (/^\d{4}(\s*-\s*(Present|\d{4}))?$/.test(date)) {
      return date;
    }
  }

  if (!date) {
    return new Date().toLocaleString('en-US', {
      timeZone: PACIFIC_TIMEZONE,
      ...(format === 'full'
        ? {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }
        : {
            year: 'numeric'
          })
    });
  }

  return new Date(date).toLocaleString('en-US', {
    timeZone: PACIFIC_TIMEZONE,
    ...(format === 'full'
      ? {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }
      : {
          year: 'numeric'
        })
  });
}

/**
 * Extract or format year for UI display
 * Handles various formats including year ranges and "Present"
 */
export function formatYearDisplay(date: string | undefined): string {
  if (!date) return '';

  // If it's a year-only string, return as-is
  if (typeof date === 'string' && /^\d{4}$/.test(date)) {
    return date;
  }

  // If it's a year range string (e.g., "2023 - Present"), return as-is
  if (typeof date === 'string' && /^\d{4}(\s*-\s*(Present|\d{4}))?$/.test(date)) {
    return date;
  }

  // For ISO dates or date strings, extract just the year
  try {
    return new Date(date).getFullYear().toString();
  } catch {
    return '';
  }
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

/**
 * Validate that a string is a properly formatted Pacific timezone date
 * @param {string} date - The date string to validate
 * @returns {boolean} True if the date is valid and in Pacific timezone
 */
/**
 * Validate a date string based on its format
 * @param {string} date - The date string to validate
 * @returns {boolean} True if the date is valid
 */
export function isValidPacificDate(date: string): boolean {
  try {
    // For year-only format (YYYY)
    if (/^\d{4}$/.test(date)) {
      const year = parseInt(date, 10);
      return year >= 2000 && year <= 2100;
    }

    // For year range format (YYYY - YYYY or YYYY - Present)
    if (/^\d{4}(\s*-\s*(Present|\d{4}))?$/.test(date)) {
      const [startYear] = date.split('-').map(s => s.trim());
      const year = parseInt(startYear, 10);
      return year >= 2000 && year <= 2100;
    }

    // For full ISO format
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(date)) {
      return true;
    }

    // For YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [year, month, day] = date.split('-').map(Number);
      return (
        year >= 2000 && year <= 2100 &&
        month >= 1 && month <= 12 &&
        day >= 1 && day <= 31
      );
    }

    // For other formats, try to convert to ISO and validate
    const formatted = toISO(date);
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[-+]\d{2}:\d{2}$/.test(formatted);
  } catch {
    return false;
  }
}
