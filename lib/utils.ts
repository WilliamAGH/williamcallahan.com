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
