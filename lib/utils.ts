import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combines multiple class name values into a single optimized string.
 *
 * Merges class names using `clsx` and resolves Tailwind CSS conflicts with `tailwind-merge`.
 *
 * @returns A merged class name string.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats a numeric value as a percentage string with a specified number of decimal places.
 *
 * @param value - The number to format as a percentage.
 * @param decimalPlaces - Number of decimal places to include (default is 2).
 * @returns The formatted percentage string (e.g., "12.34%"), or "N/A" if {@link value} is null, undefined, or NaN.
 */
export function formatPercentage(value: number | undefined | null, decimalPlaces: number = 2): string {
  if (value === undefined || value === null || isNaN(value)) {
    return 'N/A';
  }
  return `${value.toFixed(decimalPlaces)}%`;
}

/**
 * Formats a date string or Date object into a human-readable date in the "America/Los_Angeles" timezone.
 *
 * @param dateString - The date string or Date object to format.
 * @returns The formatted date string (e.g., "March 14, 2024"), or "Invalid Date" if the input is invalid.
 *
 * @remark
 * If the input is a date-only string (e.g., "YYYY-MM-DD"), it is interpreted as UTC midnight and may display as the previous day in Pacific Time due to timezone conversion.
 */
export function formatDate(dateString: string | Date | undefined): string {
  if (!dateString) {
    // console.warn('formatDate received an undefined dateString');
    return 'Invalid Date'; // Or handle as per desired behavior for undefined input
  }

  const date = new Date(dateString);

  if (isNaN(date.getTime())) {
    console.warn(`Invalid date string passed to formatDate: ${String(dateString)}`);
    return 'Invalid Date';
  }

  // If the input is a date-only string (YYYY-MM-DD), it's interpreted as UTC midnight.
  // To avoid off-by-one day errors due to timezone conversion from UTC midnight
  // to local time, we can adjust it if needed or simply format it as is.
  // The tests imply that '2024-03-14' (UTC midnight) should show as 'March 13, 2024' in PT.
  // This is the standard behavior of new Date() when given a date-only string.
  // For more robust handling, ensuring input strings include timezone information is best.

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Los_Angeles', // To match test case behavior (PST/PDT)
                                  // Or make timezone configurable or use user's local
  });
}

/**
 * Formats a numeric value as a multiple string with one decimal place followed by "x".
 *
 * @param value - The number to format.
 * @returns The formatted multiple string (e.g., "2.5x"), or "N/A" if the input is undefined, null, or not a valid number.
 */
export function formatMultiple(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) {
    return 'N/A';
  }
  return `${value.toFixed(1)}x`;
}

/**
 * Determines whether a given string is a valid URL.
 *
 * @param url - The string to validate as a URL.
 * @returns `true` if {@link url} is a valid URL; otherwise, `false`.
 */
export function isValidUrl(url: string): boolean {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_) {
    return false;
  }
}

/**
 * Extracts the domain name from a URL or cleans a company name string.
 *
 * If the input is a valid URL, returns the hostname without the "www." prefix. If the input is not a valid URL, returns a lowercased, whitespace-free version with trailing "llc", "inc", or "ltd" removed.
 *
 * @param urlOrCompany - The URL or company name to process.
 * @returns The extracted domain or cleaned company name.
 */
export function extractDomain(urlOrCompany: string): string {
  if (!urlOrCompany) return '';
  try {
    const parsedUrl = new URL(urlOrCompany.startsWith('http') ? urlOrCompany : `http://${urlOrCompany}`);
    return parsedUrl.hostname.replace(/^www\./, '');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_) {
    return urlOrCompany.toLowerCase().replace(/\s+/g, '').replace(/llc$|inc$|ltd$/, '');
  }
}

/**
 * Truncates a string to a specified maximum length, appending "..." if truncation occurs.
 *
 * @param text - The string to truncate.
 * @param maxLength - The maximum allowed length of the string before truncation.
 * @returns The truncated string with "..." appended if it exceeds {@link maxLength}, or an empty string if {@link text} is falsy.
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text) return '';
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.substring(0, maxLength)}...`;
}

/**
 * Generates a random alphanumeric string of the specified length.
 *
 * @param length - The desired length of the generated string.
 * @returns A string containing random uppercase letters, lowercase letters, and digits.
 */
export function randomString(length: number): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}
