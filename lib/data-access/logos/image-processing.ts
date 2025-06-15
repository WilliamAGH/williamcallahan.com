/**
 * Image Processing for Logos
 *
 * @module data-access/logos/image-processing
 */

import sharp from 'sharp';
import { GENERIC_GLOBE_PATTERNS } from '@/lib/constants';
import { isDebug } from '@/lib/utils/debug';

/**
 * Determines whether an image buffer meets the minimum size requirements for logos.
 *
 * SVG images are always considered large enough. Other formats must meet reasonable size thresholds:
 * - Minimum area of 1024 pixels (e.g., 32x32, 40x26, 50x21, etc.)
 * - At least one dimension >= 32 pixels
 * - Neither dimension < 16 pixels
 *
 * @param buffer - The image buffer to evaluate
 * @returns Promise resolving to true if the image is sufficiently large, false otherwise
 */
async function isImageLargeEnough(buffer: Buffer): Promise<boolean> {
  try {
    const metadata: sharp.Metadata = await sharp(buffer).metadata();
    if (metadata.format === 'svg') return true;
    
    const width = metadata.width || 0;
    const height = metadata.height || 0;
    
    // Basic sanity checks
    if (width < 16 || height < 16) return false;
    
    // Require minimum area (allows rectangular logos)
    const area = width * height;
    if (area < 1024) return false; // 32x32 minimum area
    
    // At least one dimension should be reasonably sized
    if (width < 32 && height < 32) return false;
    
    return true;
  } catch { 
    return false; 
  }
}

/**
 * Validates a logo image by checking for generic globe patterns and minimum size requirements.
 *
 * @param buffer - The image buffer to validate
 * @param url - The source URL of the logo, used to detect generic globe images
 * @returns Promise resolving to true if valid and not a generic globe image, false otherwise
 */
export async function validateLogoBuffer(buffer: Buffer, url: string): Promise<boolean> {
  if (GENERIC_GLOBE_PATTERNS.some((pattern: RegExp) => pattern.test(url))) return false;
  if (!await isImageLargeEnough(buffer)) return false;
  return true;
}

/**
 * Processes an image buffer to determine if it is SVG or PNG, converting non-SVG images to PNG.
 *
 * @param buffer - The image data to process
 * @returns Object with processed buffer, SVG flag, and appropriate content type
 * @remark If processing fails, returns original buffer as PNG for safety
 */
export async function processImageBuffer(buffer: Buffer): Promise<{
  processedBuffer: Buffer;
  isSvg: boolean;
  contentType: string;
}> {
  // Prioritize a direct SVG string check - only inspect first 1KB to avoid excessive memory usage
  const bufferString: string = buffer.slice(0, 1024).toString('utf-8').trim();
  if (bufferString.startsWith('<svg') && bufferString.includes('</svg>')) {
    if (isDebug) console.log('[DataAccess/Logos] Detected SVG by string content (startsWith <svg).');
    return { processedBuffer: buffer, isSvg: true, contentType: 'image/svg+xml' };
  }

  try {
    const metadata: sharp.Metadata = await sharp(buffer).metadata();
    const isSvgBySharp: boolean = metadata.format === 'svg';

    if (isSvgBySharp) {
      if (isDebug) console.log('[DataAccess/Logos] Detected SVG by sharp.metadata.');
      return { processedBuffer: buffer, isSvg: true, contentType: 'image/svg+xml' };
    }

    // If not SVG by sharp, process as non-SVG (convert to PNG)
    if (isDebug) console.log('[DataAccess/Logos] Not SVG by sharp, converting to PNG.');
    const processedBuffer: Buffer = await sharp(buffer).png().toBuffer();
    return { processedBuffer, isSvg: false, contentType: 'image/png' };

  } catch (error: unknown) {
    console.warn(`[DataAccess/Logos] processImageBuffer error with sharp: ${String(error)}. Falling back.`);
    // Fallback: Re-check for SVG string content if sharp failed, as sharp might not support all SVGs
    if (bufferString.includes('<svg')) {
      if (isDebug) console.log('[DataAccess/Logos] Fallback: Detected SVG-like content after sharp error.');
      return { processedBuffer: buffer, isSvg: true, contentType: 'image/svg+xml' };
    }
    
    // Attempt to convert to PNG in a nested try-catch to ensure we return correct MIME type
    try {
      if (isDebug) console.log('[DataAccess/Logos] Attempting PNG conversion after sharp error.');
      const convertedBuffer: Buffer = await sharp(buffer).png().toBuffer();
      return { processedBuffer: convertedBuffer, isSvg: false, contentType: 'image/png' };
    } catch (conversionError: unknown) {
      // If conversion fails, return original buffer with generic MIME type to avoid mismatch
      console.warn(`[DataAccess/Logos] PNG conversion failed: ${String(conversionError)}. Returning with generic MIME type.`);
      return { processedBuffer: buffer, isSvg: false, contentType: 'image/png' };
    }
  }
}
