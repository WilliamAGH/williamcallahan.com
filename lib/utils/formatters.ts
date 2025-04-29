/**
 * String Formatting Utilities
 */

/**
 * Converts a string to kebab-case.
 * Example: "San Francisco" -> "san-francisco"
 * @param {string} str The input string.
 * @returns {string} The kebab-cased string.
 */
export const kebabCase = (str: string): string =>
  str
    ?.match(/[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g)
    ?.map(x => x.toLowerCase())
    ?.join('-') || '';

/**
 * Converts a kebab-case slug back into a readable title-cased string.
 * Example: "san-francisco" -> "San Francisco"
 * @param {string} slug The input kebab-case slug.
 * @returns {string} The deslugified, title-cased string.
 */
export const deslugify = (slug: string): string =>
  slug
    ?.split('-')
    ?.map(word => word.charAt(0).toUpperCase() + word.slice(1))
    ?.join(' ') || '';