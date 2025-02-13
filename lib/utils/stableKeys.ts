/**
 * Stable Key Generation Utilities
 * @module lib/utils/stableKeys
 * @description
 * Functions for generating stable, URL-friendly keys for various content types.
 * Used for anchor links and search result deep linking.
 */

/**
 * Convert a string to a URL-friendly slug
 */
function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Generate a stable key for an education item
 */
export function generateEducationKey(id: string, year: string | undefined, name: string): string {
  const yearStr = year || 'ongoing';
  const nameSlug = slugify(name);
  return `${id}-${yearStr}-${nameSlug}`;
}

/**
 * Generate a stable key for an experience item
 */
export function generateExperienceKey(id: string, startDate: string, role: string): string {
  const year = startDate.split('-')[0];
  const roleSlug = slugify(role.split('-')[0]); // Take first part of role
  return `${id}-${year}-${roleSlug}`;
}

/**
 * Generate a stable key for an investment item
 */
export function generateInvestmentKey(id: string, year: string, stage: string, index?: number): string {
  const baseKey = `${id}-${year}-${slugify(stage)}`;
  return index !== undefined ? `${baseKey}-${index + 1}` : baseKey;
}
