/**
 * Utility Functions
 * @module lib/utils
 * @description
 * Common utility functions used throughout the application.
 */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names with Tailwind CSS classes
 * @param {...ClassValue[]} inputs - Class names to merge
 * @returns {string} Merged class names
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number as an investment multiple (e.g., 2.5x)
 * @param {number} value - The multiple value to format
 * @returns {string} Formatted multiple string
 */
export function formatMultiple(value: number): string {
  if (value === 0) return '0x';
  if (!value) return 'N/A';
  return `${value.toFixed(1)}x`;
}

/**
 * Format a number as a percentage (e.g., 25.5%)
 * @param {number} value - The percentage value to format
 * @returns {string} Formatted percentage string
 */
export function formatPercentage(value: number): string {
  if (value === 0) return '0%';
  if (!value) return 'N/A';
  return `${value.toFixed(1)}%`;
}

/**
 * Parse a date string as Pacific Time
 * @param {string | Date} input - Date string or Date object to parse
 * @returns {Date} Date object in Pacific Time
 */
export function parsePacificDate(input: string | Date): Date {
  // Create a formatter that will parse dates in Pacific time
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  // For date-only strings, set time to midnight Pacific
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [year, month, day] = input.split('-').map(Number);
    // Determine if date is in DST (April through October)
    const isDST = month >= 4 && month <= 10;
    // Create date at UTC time that corresponds to midnight Pacific
    // UTC 08:00 = PST 00:00 (standard time)
    // UTC 07:00 = PDT 00:00 (daylight savings)
    const utcHour = isDST ? 7 : 8;
    return new Date(Date.UTC(year, month - 1, day, utcHour));
  }

  // For dates with time components, preserve the time but ensure Pacific timezone
  const date = input instanceof Date ? input : new Date(input);
  const formatted = formatter.format(date)
    .replace(/(\d+)\/(\d+)\/(\d+),\s(\d+):(\d+):(\d+)/, '$3-$1-$2T$4:$5:$6')
    .replace('T24:', 'T00:');
  return new Date(formatted);
}

/**
 * Format a date for display with Pacific Time offset
 * @param {string | Date} input - Date to format
 * @returns {string} Formatted date string with timezone
 */
export function formatPacificDate(input: string | Date): string {
  const date = parsePacificDate(input);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  const tzFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    timeZoneName: 'shortOffset'
  });
  const tzString = tzFormatter.format(date);
  const tzOffset = tzString.split('GMT').pop()?.trim();
  // Ensure we have a timezone offset, defaulting to PST (-8) if not found
  const formattedOffset = tzOffset || '-8';
  return `${formatter.format(date)} (GMT${formattedOffset})`;
}

/**
 * Format a date in ISO 8601 format with Pacific Time offset
 * @param {string | Date} input - Date to format
 * @returns {string} ISO 8601 formatted date string with timezone offset
 */
export function formatISOPacific(input: string | Date): string {
  const date = parsePacificDate(input);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const tzFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    timeZoneName: 'longOffset'
  });
  // Format date parts and normalize midnight
  let formatted = formatter.format(date)
    .replace(/(\d+)\/(\d+)\/(\d+),\s(\d+):(\d+):(\d+)/, '$3-$1-$2T$4:$5:$6')
    .replace('T24:', 'T00:');

  // Extract timezone offset
  const tzString = tzFormatter.format(date);
  const offsetMatch = tzString.match(/GMT\s*([+-])(\d{1,2}):?(\d{2})?/);

  let formattedOffset: string;
  if (offsetMatch) {
    const [, sign, hours, minutes = '00'] = offsetMatch;
    formattedOffset = `${sign}${hours.padStart(2, '0')}:${minutes}`;
  } else {
    // Default to PST if no match
    formattedOffset = '-08:00';
  }

  // Ensure midnight is normalized in final output
  return `${formatted}${formattedOffset}`.replace('T24:', 'T00:');
}

/**
 * Check if a string is a valid URL
 * @param {string} str - String to check
 * @returns {boolean} Whether the string is a valid URL
 */
export function isValidUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract domain from URL or company name
 * @param {string} input - URL or company name
 * @returns {string} Extracted domain or processed company name
 */
export function extractDomain(input: string): string {
  try {
    if (input.includes('://') || input.includes('www.')) {
      const url = new URL(input.includes('://') ? input : `https://${input}`);
      return url.hostname.replace('www.', '');
    }
    return input.toLowerCase().replace(/\s+/g, '');
  } catch {
    return input.toLowerCase().replace(/\s+/g, '');
  }
}

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length before truncation
 * @returns {string} Truncated text
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

/**
 * Generate a random string of specified length
 * @param {number} length - Length of string to generate
 * @returns {string} Random string
 */
export function randomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
