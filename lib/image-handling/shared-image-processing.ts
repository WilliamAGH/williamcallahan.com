/**
 * Shared Image Processing Utilities
 *
 * Common image processing logic extracted from various modules
 * to ensure consistency across the codebase.
 *
 * @module image-handling/shared-image-processing
 */

import { isDebug } from "../utils/debug";
import type { ProcessedImageResult } from "@/types/image";
import { extractBasicImageMeta } from "./image-metadata";

/**
 * Processes an image buffer to determine format and preserve animated images.
 * This is the shared implementation used across the codebase.
 * For SVGs, automatically applies transform attribute fixes.
 *
 * @param buffer - Raw image buffer to process
 * @param logContext - Context string for logging (e.g., "UnifiedImageService", "OpenGraph")
 * @returns Processed buffer with content type and SVG flag
 */
export async function processImageBuffer(buffer: Buffer, logContext = "ImageProcessor"): Promise<ProcessedImageResult> {
  // Ensure at least one awaited expression at the top level for eslint/require-await compliance
  await Promise.resolve();

  // Check for SVG by examining buffer content
  const bufferString = buffer.toString("utf-8", 0, Math.min(1024, buffer.length)).trim();
  if (bufferString.startsWith("<svg") && bufferString.includes("</svg>")) {
    if (isDebug) console.log(`[${logContext}] Detected SVG by string content.`);

    // Process SVG with transform fixes
    const processedSvg = await processSvgWithTransformFixes(buffer, logContext);
    return {
      processedBuffer: processedSvg,
      isSvg: true,
      contentType: "image/svg+xml",
    };
  }

  try {
    const meta = await extractBasicImageMeta(buffer);
    const rawFormat = meta.format;
    const format = typeof rawFormat === "string" ? rawFormat.toLowerCase() : "";

    if (format === "svg") {
      if (isDebug) console.log(`[${logContext}] Detected SVG via edge-compatible parser.`);

      // Process SVG with transform fixes
      const processedSvg = await processSvgWithTransformFixes(buffer, logContext);
      return { processedBuffer: processedSvg, isSvg: true, contentType: "image/svg+xml" };
    }

    // Preserve original for all other formats; content-type guessed
    const contentTypeMap: Record<string, string> = {
      png: "image/png",
      jpeg: "image/jpeg",
      jpg: "image/jpeg",
      webp: "image/webp",
      gif: "image/gif",
      ico: "image/x-icon",
    };

    await Promise.resolve(); // Keep async for API compatibility
    return {
      processedBuffer: buffer,
      isSvg: false,
      contentType: contentTypeMap[format] || "application/octet-stream",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[${logContext}] Image processing error: ${errorMessage}`);

    // Fallback: try to detect SVG-like content
    if (bufferString.includes("<svg")) {
      if (isDebug) console.log(`[${logContext}] Fallback: Detected SVG-like content.`);

      // Process SVG with transform fixes
      const processedSvg = await processSvgWithTransformFixes(buffer, logContext);
      return {
        processedBuffer: processedSvg,
        isSvg: true,
        contentType: "image/svg+xml",
      };
    }

    // Detect format from magic numbers
    const magicNumbers = {
      gif: buffer.slice(0, 3).toString() === "GIF",
      png: buffer.slice(1, 4).toString() === "PNG",
      jpeg: buffer[0] === 0xff && buffer[1] === 0xd8,
      webp: buffer.slice(0, 4).toString() === "RIFF" && buffer.slice(8, 12).toString() === "WEBP",
    };

    const contentType = magicNumbers.gif
      ? "image/gif"
      : magicNumbers.png
        ? "image/png"
        : magicNumbers.jpeg
          ? "image/jpeg"
          : magicNumbers.webp
            ? "image/webp"
            : "image/png";

    console.warn(`[${logContext}] Detected ${contentType} from magic numbers.`);
    return {
      processedBuffer: buffer,
      isSvg: false,
      contentType,
    };
  }
}

/**
 * Processes SVG content with automatic transform attribute fixes
 * Integrates svg-transform-fix utilities for consistent SVG handling
 */
async function processSvgWithTransformFixes(buffer: Buffer, logContext: string): Promise<Buffer> {
  try {
    const svgContent = buffer.toString("utf-8");

    // Apply transform fixes using the battle-tested utilities
    const { processSvgTransforms } = await import("./svg-transform-fix");
    const fixedSvgContent = processSvgTransforms(svgContent);

    if (fixedSvgContent && fixedSvgContent !== svgContent) {
      if (isDebug) console.log(`[${logContext}] Applied SVG transform fixes`);
      return Buffer.from(fixedSvgContent, "utf-8");
    }

    return buffer;
  } catch (error) {
    console.warn(`[${logContext}] SVG transform fix failed:`, error);
    return buffer; // Return original on error
  }
}

/**
 * Simplified version for contexts that only need content type detection
 *
 * @param buffer - Raw image buffer
 * @param logContext - Context string for logging
 * @returns Object with processed buffer and content type
 */
export async function processImageBufferSimple(
  buffer: Buffer,
  logContext = "ImageProcessor",
): Promise<{ processedBuffer: Buffer; contentType: string }> {
  const result = await processImageBuffer(buffer, logContext);
  return {
    processedBuffer: result.processedBuffer,
    contentType: result.contentType,
  };
}
