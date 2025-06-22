/**
 * Content Type Utilities
 * 
 * Maps content types to file extensions for proper asset storage
 */

/**
 * Maps content-type headers to file extensions
 */
const CONTENT_TYPE_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/avif': '.avif',
  'image/bmp': '.bmp',
  'image/tiff': '.tiff',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
};

/**
 * Create reverse mapping for efficient lookups
 */
const EXTENSION_TO_CONTENT_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(CONTENT_TYPE_TO_EXTENSION).map(([contentType, ext]) => [ext, contentType])
);

/**
 * Gets the file extension for a given content type
 * @param contentType The content-type header value
 * @returns The file extension including the dot (e.g., '.jpg')
 */
export function getExtensionFromContentType(contentType: string | null): string {
  if (!contentType) return '.jpg'; // Default fallback
  
  // Extract the base content type (remove charset and other parameters)
  const baseType = contentType.split(';')[0]?.trim().toLowerCase() || '';
  
  return CONTENT_TYPE_TO_EXTENSION[baseType] || '.jpg';
}

/**
 * Gets the content type for a given file extension
 * @param extension The file extension (with or without dot)
 * @returns The content type string
 */
export function getContentTypeFromExtension(extension: string): string {
  // Normalize extension (ensure it starts with a dot)
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  
  // Direct O(1) lookup
  return EXTENSION_TO_CONTENT_TYPE[ext.toLowerCase()] || 'application/octet-stream';
}