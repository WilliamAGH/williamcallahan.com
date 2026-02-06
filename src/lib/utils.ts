/**
 * Core Utility Functions
 *
 * Provides application-wide utility functions for formatting, validation, and string manipulation
 * Includes helpers for CSS class merging, date formatting, and URL processing
 *
 * @module lib/utils
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { stripWwwPrefix } from "@/lib/utils/url-utils";

/**
 * Normalizes a string by trimming and converting to lowercase.
 * Useful for case-insensitive comparisons and standardized input processing.
 *
 * @param str - The string to normalize
 * @returns The trimmed and lowercased string
 */
export function normalizeString(str: string): string {
  if (!str) return "";
  return str.trim().toLowerCase();
}

/**
 * Combines multiple class name values into a single optimized string
 *
 * Merges class names using clsx and resolves Tailwind CSS conflicts with tailwind-merge
 *
 * @returns A merged class name string
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Fixed timestamp used during production builds to ensure deterministic output.
 * Value: 1700000000000 (approx Nov 2023)
 */
export const FIXED_BUILD_TIMESTAMP = 1700000000000;

const getRuntimeEnvValue = (key: string): string | undefined => {
  if (typeof globalThis === "undefined") return undefined;
  const runtimeEnv = (globalThis as { process?: NodeJS.Process }).process?.env;
  return runtimeEnv?.[key];
};

let monotonicFallbackCounter = 0;
let monotonicFallbackLogged = false;

const getFallbackMonotonicTime = (): number => {
  monotonicFallbackCounter = Math.min(monotonicFallbackCounter + 1, Number.MAX_SAFE_INTEGER);
  return FIXED_BUILD_TIMESTAMP + monotonicFallbackCounter;
};

/**
 * Provides a monotonic timestamp for cache expiration and timing.
 * Uses performance.timeOrigin + performance.now() (via perf_hooks in Node) to
 * avoid backwards jumps, and falls back to an increment-only counter when the
 * Performance API is unavailable to keep build output deterministic.
 */
export function getMonotonicTime(): number {
  // During Next.js production build, return a fixed timestamp to avoid "Date.now()" errors
  // in Server Components (static generation)
  const nextPhase = getRuntimeEnvValue("NEXT_PHASE");
  if (nextPhase === "phase-production-build") {
    return FIXED_BUILD_TIMESTAMP;
  }

  if (typeof globalThis !== "undefined") {
    const perf = globalThis.performance;
    if (perf && typeof perf.now === "function") {
      const timeOrigin = typeof perf.timeOrigin === "number" ? perf.timeOrigin : 0;
      const value = Math.floor(timeOrigin + perf.now());
      if (Number.isFinite(value)) {
        return value;
      }
    }
  }

  if (!monotonicFallbackLogged) {
    monotonicFallbackLogged = true;
    console.warn(
      "[getMonotonicTime] Performance API unavailable; using deterministic fallback timestamp.",
    );
  }

  return getFallbackMonotonicTime();
}

/**
 * Formats a numeric percentage value (0–100) as a string with a '%' suffix
 *
 * @param value - The percentage value (e.g., 12.34 for "12.34%")
 * @param decimalPlaces - Number of decimal places to include (default is 2)
 * @returns The formatted percentage string (e.g., "12.34%"), or "N/A" if invalid
 *
 * @example
 * formatPercentage(12.34) // returns "12.34%"
 * formatPercentage(100 * 0.1234) // returns "12.34%" (multiply ratio by 100 first)
 */
export function formatPercentage(value: number | undefined | null, decimalPlaces = 2): string {
  if (
    value === undefined ||
    value === null ||
    Number.isNaN(value) ||
    value === Number.POSITIVE_INFINITY ||
    value === Number.NEGATIVE_INFINITY
  ) {
    return "N/A";
  }
  return `${value.toFixed(decimalPlaces)}%`;
}

/**
 * Formats a date string or Date object into a human-readable date in the "America/Los_Angeles" timezone
 *
 * @param dateString - The date string or Date object to format
 * @returns The formatted date string (e.g., "March 14, 2024"), or "Invalid Date" if invalid
 * @remark Date-only strings are interpreted as UTC midnight and may display as previous day in PT
 */
export function formatDate(dateString: string | Date | undefined | number): string {
  if (typeof dateString !== "string" && !(dateString instanceof Date)) {
    return "Invalid Date";
  }

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    console.warn(`Invalid date string passed to formatDate: ${String(dateString)}`);
    return "Invalid Date";
  }

  // If the input is a date-only string (YYYY-MM-DD), it's interpreted as UTC midnight.
  // To avoid off-by-one day errors due to timezone conversion from UTC midnight
  // to local time, we can adjust it if needed or simply format it as is.
  // The tests imply that '2024-03-14' (UTC midnight) should show as 'March 13, 2024' in PT.
  // This is the standard behavior of new Date() when given a date-only string.
  // For more robust handling, ensuring input strings include timezone information is best.

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Los_Angeles", // To match test case behavior (PST/PDT)
    // Or make timezone configurable or use user's local
  });
}

/**
 * Formats a numeric value as a multiple string followed by "x"
 *
 * @param value - The number to format
 * @returns The formatted multiple string (e.g., "2.5x"), or "N/A" if invalid
 */
export function formatMultiple(value: number | undefined | null): string {
  if (
    value === undefined ||
    value === null ||
    Number.isNaN(value) ||
    value === Number.POSITIVE_INFINITY ||
    value === Number.NEGATIVE_INFINITY
  ) {
    return "N/A";
  }
  if (value === 0) {
    return "0x";
  }
  // For very large or very small numbers, use scientific notation
  if (Math.abs(value) >= 1e6 || (value !== 0 && Math.abs(value) < 1e-4)) {
    let exponential = value.toExponential();
    // Remove .0 before e if present, e.g., 1.0e+20 -> 1e+20
    exponential = exponential.replace(/\.0+(e[+-]\d+)$/, "$1");
    return `${exponential}x`;
  }
  // For integers, add .0 for consistency
  if (Number.isInteger(value)) {
    return `${value}.0x`;
  }
  // For other numbers, use their standard string representation
  return `${value}x`;
}

/**
 * Determines whether a given string is a valid URL
 *
 * @param url - The string to validate as a URL
 * @returns true if the string is a valid URL, false otherwise
 */
export function isValidUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsedUrl = new URL(url);
    // Restrict to http and https protocols
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Common business entity suffixes to remove from company names
 */
const COMMON_SUFFIXES = [
  "llc",
  "inc",
  "ltd",
  "llp",
  "pllc",
  "corp",
  "corporation",
  "co",
  "limited",
] as const;

/**
 * Regex for punctuation characters to remove from company names
 */
const PUNCTUATION_REGEX = /[.,/#!$%^&*;:=_{}`~()-]/g;

/**
 * Validates if a hostname is a valid IP address (IPv4)
 */
function isIpAddress(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

/**
 * Validates if a hostname has a TLD (contains at least one dot)
 */
function hasTld(hostname: string): boolean {
  return hostname.includes(".");
}

/**
 * Attempts to extract a domain from a string that looks like a URL.
 * Returns null if the input doesn't appear to be a URL or parsing fails.
 */
function tryExtractDomain(input: string): string | null {
  if (!input.includes(".") && !input.includes(":")) return null;

  const urlStr = /^https?:\/\//i.test(input) ? input : `http://${input}`;

  try {
    const url = new URL(urlStr);
    if (!url.hostname) return null;

    const isValid =
      isIpAddress(url.hostname) || hasTld(url.hostname) || url.hostname === "localhost";
    return isValid ? stripWwwPrefix(url.hostname) : null;
  } catch (error: unknown) {
    if (process.env.NODE_ENV !== "test") {
      console.warn(
        "[normalizeCompanyOrDomain] URL parse failed; falling back to name cleanup.",
        error,
      );
    }
    return null;
  }
}

/**
 * Removes common business suffixes from a cleaned company name.
 * Only removes one suffix if found at the end.
 */
function removeBusinessSuffixes(cleaned: string): string {
  for (const suffix of COMMON_SUFFIXES) {
    if (cleaned.endsWith(suffix) && cleaned.length > suffix.length) {
      return cleaned.slice(0, -suffix.length);
    }
  }
  return cleaned;
}

/**
 * Extracts a domain from a URL or normalizes a company name string.
 *
 * This function serves a dual purpose:
 * - For valid URLs: Returns hostname without "www." prefix
 * - For non-URLs (company names): Returns lowercased, whitespace-free version with common suffixes removed
 *
 * @param urlOrCompany - The URL or company name to process
 * @returns The extracted domain or cleaned company name
 *
 * @see {@link @/lib/utils/url-utils#extractDomain} for pure URL hostname extraction
 * @see {@link @/lib/utils/url-utils#extractDomainWithoutWww} for URL extraction with www stripping
 */
export function normalizeCompanyOrDomain(urlOrCompany: string | number): string {
  if (urlOrCompany == null) return "";

  const inputStr = String(urlOrCompany);
  if (!inputStr) return "";

  const domain = tryExtractDomain(inputStr);
  if (domain) return domain;

  const cleaned = inputStr.toLowerCase().replaceAll(PUNCTUATION_REGEX, "").replaceAll(/\s+/g, "");

  return removeBusinessSuffixes(cleaned);
}

/**
 * Truncates a string to a specified maximum length, appending "..." if truncated
 *
 * @param text - The string to truncate
 * @param maxLength - The maximum allowed length before truncation
 * @returns The truncated string with "..." appended if needed, or empty string if text is falsy
 */
export function truncateText(text: string, maxLength: number): string {
  if (maxLength < 0) {
    throw new Error("maxLength cannot be negative");
  }
  if (!text) return "";
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.substring(0, maxLength)}...`;
}

/**
 * Generates a random alphanumeric string of the specified length
 *
 * @param length - The desired length of the generated string
 * @returns A string with random uppercase letters, lowercase letters, and digits
 */
export function randomString(length: number): string {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}
