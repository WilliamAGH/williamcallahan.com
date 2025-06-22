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
  
  // Find the content type by extension
  for (const [contentType, mappedExt] of Object.entries(CONTENT_TYPE_TO_EXTENSION)) {
    if (mappedExt === ext.toLowerCase()) {
      return contentType;
    }
  }
  
  // Fallback based on common extensions
  switch (ext.toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}