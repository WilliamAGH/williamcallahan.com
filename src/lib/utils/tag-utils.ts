/**
 * Tag Utility Functions
 *
 * Consistent functions for handling tag formatting and normalization
 * across the application.
 *
 * @module lib/utils/tag-utils
 */

/** Max length for potential acronyms (e.g., "AI", "ML") */
const MAX_ACRONYM_LENGTH = 2;
/** Unicode combining diacritical marks range */
const COMBINING_DIACRITICAL_START = 0x0300;
const COMBINING_DIACRITICAL_END = 0x036f;
/** Minimum token length for singularization */
const MIN_SINGULARIZE_LENGTH = 3;

import type { BookmarkTag } from "@/types/schemas/bookmark";
import { normalizeString } from "@/lib/utils";
import { sanitizeControlChars } from "@/lib/utils/sanitize";

/**
 * Format tag for display: Title Case unless mixed-case proper nouns
 *
 * @param tag - Raw tag string to format
 * @returns Formatted tag string
 *
 * @example
 * formatTagDisplay('react') // Returns 'React'
 * formatTagDisplay('javascript') // Returns 'Javascript'
 * formatTagDisplay('nextjs') // Returns 'Nextjs'
 * formatTagDisplay('iPhone') // Returns 'iPhone' (preserved)
 * formatTagDisplay('AI tools') // Returns 'AI Tools'
 */
export function formatTagDisplay(tag: string): string {
  if (!tag) return "";

  // Preserve mixed-case proper nouns that already include uppercase beyond the first character
  if (/[A-Z]/.test(tag.slice(1))) {
    return tag;
  }

  return tag
    .split(/[\s-]+/)
    .map((word) => {
      // Preserve all-caps for short acronyms such as "AI", "ML", "VR", etc.
      const isPotentialAcronym = word.length <= MAX_ACRONYM_LENGTH && word === word.toLowerCase();
      if (isPotentialAcronym) {
        return word.toUpperCase();
      }

      // Default title-case transformation
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Normalize tag array to string array, handling both string and object tags
 *
 * @param tags - Array of tags that might be strings or objects
 * @returns Array of tag strings
 */
export function normalizeTagsToStrings(tags: Array<string | BookmarkTag>): string[] {
  if (!Array.isArray(tags)) return [];

  return tags
    .map((tag) => (typeof tag === "string" ? tag : tag && "name" in tag ? tag.name : ""))
    .filter(Boolean);
}

/**
 * Sanitize a string by removing Unicode control characters
 *
 * @param text - String to sanitize
 * @returns Sanitized string without Unicode control characters
 */
export function sanitizeUnicode(text: string): string {
  return sanitizeControlChars(text);
}

/**
 * Convert a string to a URL-friendly slug format
 *
 * @param text - String to convert to slug
 * @returns URL-friendly slug
 */
export function sanitizeTagSlug(text: string): string {
  if (!text) return "";

  // First sanitize Unicode control characters
  const cleanText = sanitizeUnicode(text);

  return cleanText.toLowerCase().replace(/\s+/g, "-"); // Replace spaces with hyphens
}

/**
 * Convert tag string to URL-friendly slug
 *
 * @param tag - Raw tag string
 * @returns URL-friendly tag slug
 *
 * @example
 * tagToSlug('React Native') // Returns 'react-native'
 * tagToSlug('AI & ML') // Returns 'ai-and-ml'
 * tagToSlug('C++') // Returns 'c-plus-plus'
 * tagToSlug('.NET') // Returns 'dotnet'
 */
export function tagToSlug(tag: string): string {
  if (!tag) return "";

  // First sanitize Unicode control characters
  let cleanTag = sanitizeUnicode(tag);

  // Handle common special cases before converting to lowercase
  cleanTag = cleanTag
    .replace(/\+\+/g, "-plus-plus")
    .replace(/\+/g, "-plus")
    .replace(/&/g, "-and-")
    .replace(/#/g, "-sharp")
    .replace(/@/g, "-at-");

  // Now handle dots more carefully - only replace dots that are part of extensions
  if (cleanTag.startsWith(".")) {
    cleanTag = `dot${cleanTag.substring(1)}`;
  }
  cleanTag = cleanTag.replace(/\.(?=[a-zA-Z])/g, "dot"); // .NET -> dotNET, Node.js -> Nodedotjs

  // Remove diacritics by normalizing to NFD then removing combining marks
  // Using character code checks to avoid character class issues
  const normalized = cleanTag.normalize("NFD");
  const withoutDiacritics = Array.from(normalized)
    .filter((char) => {
      const code = char.charCodeAt(0);
      // Filter out combining diacritical marks (U+0300 to U+036F)
      return code < COMBINING_DIACRITICAL_START || code > COMBINING_DIACRITICAL_END;
    })
    .join("");

  return withoutDiacritics
    .toLowerCase()
    .replace(/[^\w\s-]/g, "") // Remove remaining special chars except spaces and hyphens
    .replace(/_/g, "-") // Replace underscores with hyphens
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Convert slug back to a displayable tag format
 *
 * @param slug - URL slug
 * @returns Readable tag string
 *
 * @example
 * slugToTagDisplay('react-native') // Returns 'React Native'
 */
export function slugToTagDisplay(slug: string): string {
  if (!slug) return "";

  return formatTagDisplay(slug.replace(/-/g, " "));
}

/**
 * Normalizes and deduplicates a list of tag strings.
 * Converts to lowercase, trims whitespace, removes duplicates.
 *
 * @param tags - Array of tag strings to normalize
 * @returns Deduplicated array of normalized (lowercase, trimmed) tags
 *
 * @example
 * normalizeAndDeduplicateTags(['React', ' react ', 'Vue'])
 * // Returns ['react', 'vue']
 */
export function normalizeAndDeduplicateTags(tags: string[]): string[] {
  if (!Array.isArray(tags)) return [];
  return Array.from(new Set(tags.map((t) => normalizeString(t))));
}

const CATEGORY_PHRASE_ALIASES: Readonly<Record<string, string>> = {
  cli: "command line tools",
  "command line tool": "command line tools",
  "command line": "command line tools",
  terminal: "command line tools",
  "terminal tools": "command line tools",
  "dev tools": "developer tools",
  devtools: "developer tools",
  "developer tool": "developer tools",
  "developer tooling": "developer tools",
  tooling: "developer tools",
  llm: "ai",
  "machine learning": "ai",
  "artificial intelligence": "ai",
};

function normalizeCategoryInput(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singularizeToken(token: string): string {
  if (token.length <= MIN_SINGULARIZE_LENGTH || !token.endsWith("s")) {
    return token;
  }
  return token.slice(0, -1);
}

export function getCanonicalCategoryKey(value: string): string {
  const normalized = normalizeCategoryInput(value);
  if (!normalized) {
    return "";
  }

  const aliasedPhrase = CATEGORY_PHRASE_ALIASES[normalized];
  if (aliasedPhrase) {
    return aliasedPhrase;
  }

  const tokens = normalized
    .split(" ")
    .map((token) => CATEGORY_PHRASE_ALIASES[token] ?? token)
    .flatMap((token) => token.split(" "))
    .map((token) => singularizeToken(token))
    .filter(Boolean);

  if (tokens.length === 0) {
    return "";
  }

  return Array.from(new Set(tokens))
    .toSorted((a, b) => a.localeCompare(b))
    .join(" ");
}

export function canonicalizeCategoryLabel(value: string): string {
  const canonicalKey = getCanonicalCategoryKey(value);
  if (!canonicalKey) {
    return "";
  }
  return canonicalKey
    .split(" ")
    .map((word) => formatTagDisplay(word))
    .join(" ");
}

export function categoriesSemanticallyMatch(a: string, b: string): boolean {
  return getCanonicalCategoryKey(a) === getCanonicalCategoryKey(b);
}
