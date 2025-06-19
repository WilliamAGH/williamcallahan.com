/**
 * Logo image processing - validation, format detection & conversion
 *
 * Features: Size validation (32x32 min), SVG detection, PNG conversion
 * Globe detection: URL pattern matching against GENERIC_GLOBE_PATTERNS
 *
 * @module data-access/logos/image-processing
 */

import { GENERIC_GLOBE_PATTERNS } from "@/lib/constants";
import { isDebug } from "@/lib/utils/debug";
import sharp from "sharp";

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
    if (metadata.format === "svg") return true;

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
  if (!(await isImageLargeEnough(buffer))) return false;
  return true;
}

/**
 * Processes an image buffer to determine format and preserve animated images.
 *
 * @param buffer - The image data to process
 * @returns Object with processed buffer, SVG flag, and appropriate content type
 * @remark Preserves GIF and WebP animations, only converts static images to PNG
 */
export async function processImageBuffer(buffer: Buffer): Promise<{
  processedBuffer: Buffer;
  isSvg: boolean;
  contentType: string;
}> {
  // Prioritize a direct SVG string check - only inspect first 1KB to avoid excessive memory usage
  const bufferString: string = buffer.slice(0, 1024).toString("utf-8").trim();
  if (bufferString.startsWith("<svg") && bufferString.includes("</svg>")) {
    if (isDebug) console.log("[DataAccess/Logos] Detected SVG by string content (startsWith <svg).");
    return { processedBuffer: buffer, isSvg: true, contentType: "image/svg+xml" };
  }

  try {
    const metadata: sharp.Metadata = await sharp(buffer).metadata();
    const format = metadata.format;

    if (format === "svg") {
      if (isDebug) console.log("[DataAccess/Logos] Detected SVG by sharp.metadata.");
      return { processedBuffer: buffer, isSvg: true, contentType: "image/svg+xml" };
    }

    // Preserve animated formats (GIF and WebP)
    if (format === "gif" || (format === "webp" && metadata.pages && metadata.pages > 1)) {
      if (isDebug) console.log(`[DataAccess/Logos] Preserving animated ${format} format.`);
      return {
        processedBuffer: buffer,
        isSvg: false,
        contentType: format === "gif" ? "image/gif" : "image/webp",
      };
    }

    // For static images, convert to PNG for consistency
    if (format === "jpeg" || format === "jpg" || format === "png" || format === "webp") {
      // Already PNG? Return as-is
      if (format === "png") {
        if (isDebug) console.log("[DataAccess/Logos] Already PNG format, returning as-is.");
        return { processedBuffer: buffer, isSvg: false, contentType: "image/png" };
      }

      // Convert other static formats to PNG
      if (isDebug) console.log(`[DataAccess/Logos] Converting static ${format} to PNG.`);
      const processedBuffer: Buffer = await sharp(buffer).png().toBuffer();
      return { processedBuffer, isSvg: false, contentType: "image/png" };
    }

    // Unknown format - try to convert to PNG
    if (isDebug) console.log(`[DataAccess/Logos] Unknown format '${format}', attempting PNG conversion.`);
    const processedBuffer: Buffer = await sharp(buffer).png().toBuffer();
    return { processedBuffer, isSvg: false, contentType: "image/png" };
  } catch (error: unknown) {
    console.warn(`[DataAccess/Logos] processImageBuffer error with sharp: ${String(error)}. Falling back.`);
    // Fallback: Re-check for SVG string content if sharp failed, as sharp might not support all SVGs
    if (bufferString.includes("<svg")) {
      if (isDebug) console.log("[DataAccess/Logos] Fallback: Detected SVG-like content after sharp error.");
      return { processedBuffer: buffer, isSvg: true, contentType: "image/svg+xml" };
    }

    // For non-SVG failures, return original buffer with best-guess content type
    // Try to detect format from buffer magic numbers
    const isGif = buffer.slice(0, 3).toString() === "GIF";
    const isPng = buffer.slice(1, 4).toString() === "PNG";
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
    const isWebP = buffer.slice(0, 4).toString() === "RIFF" && buffer.slice(8, 12).toString() === "WEBP";

    if (isGif) {
      return { processedBuffer: buffer, isSvg: false, contentType: "image/gif" };
    }
    if (isPng) {
      return { processedBuffer: buffer, isSvg: false, contentType: "image/png" };
    }
    if (isJpeg) {
      return { processedBuffer: buffer, isSvg: false, contentType: "image/jpeg" };
    }
    if (isWebP) {
      return { processedBuffer: buffer, isSvg: false, contentType: "image/webp" };
    }

    // Ultimate fallback
    console.warn("[DataAccess/Logos] Could not determine image format. Returning original buffer as PNG.");
    return { processedBuffer: buffer, isSvg: false, contentType: "image/png" };
  }
}
