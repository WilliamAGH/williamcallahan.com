/**
 * Tag Utility Functions
 *
 * Consistent functions for handling tag formatting and normalization
 * across the application.
 *
 * @module lib/utils/tag-utils
 */

import type { BookmarkTag } from '@/types';

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
  if (!tag) return '';

  // Preserve if mixed-case beyond first char (e.g. iPhone, aVenture)
  if (/[A-Z]/.test(tag.slice(1))) {
    return tag;
  }

  // Otherwise convert to title case
  return tag
    .split(/[\s-]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
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
    .map(tag => typeof tag === 'string' ? tag : (tag && 'name' in tag ? tag.name : ''))
    .filter(Boolean);
}

/**
 * Sanitize a string by removing Unicode control characters
 *
 * @param text - String to sanitize
 * @returns Sanitized string without Unicode control characters
 */
export function sanitizeUnicode(text: string): string {
  if (!text) return '';

  // Strip Unicode control characters (including bidi controls)
  return text.replace(/[\u007F-\u009F\u200B-\u200F\u2028-\u202F\u2066-\u206F]/g, '');
}

/**
 * Convert a string to a URL-friendly slug format
 *
 * @param text - String to convert to slug
 * @returns URL-friendly slug
 */
export function sanitizeTagSlug(text: string): string {
  if (!text) return '';

  // First sanitize Unicode control characters
  const cleanText = sanitizeUnicode(text);

  return cleanText
    .toLowerCase()
    .replace(/\s+/g, '-'); // Replace spaces with hyphens
}

/**
 * Convert tag string to URL-friendly slug
 *
 * @param tag - Raw tag string
 * @returns URL-friendly tag slug
 *
 * @example
 * tagToSlug('React Native') // Returns 'react-native'
 * tagToSlug('AI & ML') // Returns 'ai-ml'
 */
export function tagToSlug(tag: string): string {
  if (!tag) return '';

  // First sanitize Unicode control characters
  const cleanTag = sanitizeUnicode(tag);

  return cleanTag
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special chars except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-'); // Replace multiple hyphens with single hyphen
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
  if (!slug) return '';

  return formatTagDisplay(slug.replace(/-/g, ' '));
}