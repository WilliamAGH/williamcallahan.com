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
  // Prioritize a direct SVG string check
  const bufferString: string = buffer.toString('utf-8').trim();
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
    if (isDebug) console.log('[DataAccess/Logos] Fallback: Defaulting to PNG content type after sharp error and no SVG string match.');
    // If sharp fails and it's not detected as SVG by string, assume it's a raster and return original buffer as PNG (or attempt conversion if safe)
    // For safety, returning original buffer with PNG type if conversion also risky or failed.
    return { processedBuffer: buffer, isSvg: false, contentType: 'image/png' };
  }
}
