/**
 * Image Comparison Module
 * @module lib/imageCompare
 * @description
 * Provides utilities for comparing images using perceptual hashing.
 * Used to detect generic globe icons and ensure only actual company
 * logos are displayed. Implements a multi-step comparison process:
 * 1. Format and dimension validation
 * 2. Image normalization
 * 3. Perceptual hash generation
 * 4. Hash comparison
 *
 * @example
 * ```typescript
 * // Compare two images
 * const similar = await compareImages(logo1Buffer, logo2Buffer);
 *
 * if (similar) {
 *   console.log('Images are perceptually similar');
 * }
 * ```
 */

import { createHash } from "node:crypto";
import sharp from "sharp";
import { VALID_IMAGE_FORMATS, MAX_SIZE_DIFF, MIN_LOGO_SIZE } from "@/lib/constants";
import { logger } from "@/lib/logger";
import type { ValidatedMetadata } from "@/types/logo";

/**
 * Configuration constants for image comparison
 * @internal
 */
const CONFIG = {
  /** Hash size for perceptual hashing */
  HASH_SIZE: 16,

  /** Minimum logo dimensions */
  MIN_SIZE: MIN_LOGO_SIZE,

  /** Maximum allowed difference in dimensions */
  MAX_SIZE_DIFF: MAX_SIZE_DIFF,

  /** Valid image formats */
  FORMATS: VALID_IMAGE_FORMATS,

  /** Hash algorithm to use */
  HASH_ALGORITHM: "sha256" as const,

  /** Hash encoding format */
  HASH_ENCODING: "hex" as const,
} as const;

// Narrow a string to a valid format literal
/**
 * Checks if a given string is a valid image format.
 *
 * @param {string} f - The format string to validate.
 * @returns {boolean} True if the format is valid, false otherwise.
 *
 * @example
 * ```typescript
 * if (isValidFormat('png')) {
 *   console.log('Valid format');
 * } else {
 *   console.error('Invalid format');
 * }
 * ```
 */
function isValidFormat(f: string): f is (typeof CONFIG.FORMATS)[number] {
  return (CONFIG.FORMATS as readonly string[]).includes(f);
}

/**
 * Custom error class for image comparison errors
 * @class
 */
export class ImageCompareError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageCompareError";
  }
}

/**
 * Gets and validates image metadata
 * @param {Buffer} buffer - Image buffer to analyze
 * @returns {Promise<ValidatedMetadata>} Image metadata with validation results
 * @throws {ImageCompareError} If image processing fails
 * @internal
 *
 * @example
 * ```typescript
 * const metadata = await getValidatedMetadata(imageBuffer);
 * if (!metadata.isValid) {
 *   console.error('Invalid image:', metadata.validationError);
 * }
 * ```
 */
async function getValidatedMetadata(buffer: Buffer): Promise<ValidatedMetadata> {
  try {
    const metadata = await sharp(buffer).metadata();

    const width = metadata.width || 0;
    const height = metadata.height || 0;
    const format = metadata.format || "";

    // Validate dimensions
    if (width < CONFIG.MIN_SIZE || height < CONFIG.MIN_SIZE) {
      return {
        width,
        height,
        format,
        isValid: false,
        validationError: `Image too small: ${width}x${height}. Minimum size: ${CONFIG.MIN_SIZE}x${CONFIG.MIN_SIZE}`,
      };
    }

    // Validate format - Use type assertion if includes needs narrower type
    // Or check if includes works directly with string now
    // Let's try without the cast first, assuming TS/ESLint handles it
    if (!isValidFormat(format)) {
      // If the above still fails, we might need a helper or different check
      // Original failing code: if (!CONFIG.FORMATS.includes(format as any))
      return {
        width,
        height,
        format,
        isValid: false,
        validationError: `Invalid format: ${format}. Must be one of: ${CONFIG.FORMATS.join(", ")}`,
      };
    }

    return {
      width,
      height,
      format,
      isValid: true,
    };
  } catch (error) {
    throw new ImageCompareError(
      `Failed to get image metadata: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Calculates perceptual hash of an image
 * @param {Buffer} buffer - Image buffer to hash
 * @returns {Promise<string>} Perceptual hash of the image
 * @throws {ImageCompareError} If image processing fails
 * @internal
 *
 * @example
 * ```typescript
 * const hash = await getImageHash(imageBuffer);
 * console.log('Image hash:', hash);
 * ```
 */
async function getImageHash(buffer: Buffer): Promise<string> {
  try {
    // Normalize image for consistent hashing:
    // - Resize to fixed size (small enough for quick comparison, big enough for details)
    // - Convert to grayscale (remove color variations)
    // - Get raw pixel data
    const normalized = await sharp(buffer)
      .resize(CONFIG.HASH_SIZE, CONFIG.HASH_SIZE, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer();

    // Create hash of normalized pixel data
    return createHash(CONFIG.HASH_ALGORITHM).update(normalized).digest(CONFIG.HASH_ENCODING);
  } catch (error) {
    throw new ImageCompareError(
      `Failed to generate image hash: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Compares two images to determine if they're perceptually similar
 * @param {Buffer} image1 - First image buffer
 * @param {Buffer} image2 - Second image buffer
 * @returns {Promise<boolean>} True if images are perceptually similar
 * @throws {ImageCompareError} If image processing fails
 *
 * @example
 * ```typescript
 * try {
 *   const similar = await compareImages(logo1Buffer, logo2Buffer);
 *   if (similar) {
 *     console.log('Images are similar');
 *   } else {
 *     console.log('Images are different');
 *   }
 * } catch (error) {
 *   console.error('Comparison failed:', error);
 * }
 * ```
 *
 * @remarks
 * Implements a multi-step comparison process:
 * 1. Validates image formats and dimensions
 * 2. Checks if image sizes are within acceptable difference range
 * 3. Normalizes images to PNG format for consistent comparison
 * 4. Generates and compares perceptual hashes
 */
export async function compareImages(image1: Buffer, image2: Buffer): Promise<boolean> {
  try {
    // Validate inputs
    if (!image1 || !image2) {
      logger.warn("Invalid input: image buffers are required");
      return false;
    }

    let meta1: ValidatedMetadata; // Explicitly type meta1
    let meta2: ValidatedMetadata; // Explicitly type meta2
    try {
      // Get and validate metadata for both images
      [meta1, meta2] = await Promise.all([getValidatedMetadata(image1), getValidatedMetadata(image2)]);
    } catch (error) {
      logger.warn(
        "Metadata validation failed:",
        error instanceof ImageCompareError
          ? error.message
          : `Failed to get image metadata: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      return false;
    }

    // Check if both images are valid
    if (!meta1.isValid || !meta2.isValid) {
      const error = meta1.validationError || meta2.validationError;
      logger.warn("Image validation failed:", error);
      return false;
    }

    // Check if sizes are too different
    const sizeDiff = Math.abs(meta1.width - meta2.width) + Math.abs(meta1.height - meta2.height);
    if (sizeDiff > CONFIG.MAX_SIZE_DIFF) {
      logger.warn(`Size difference too large: ${sizeDiff}px (max: ${CONFIG.MAX_SIZE_DIFF}px)`);
      return false;
    }

    let norm1: Buffer; // Explicitly type norm1
    let norm2: Buffer; // Explicitly type norm2
    try {
      // Convert both images to PNG for consistent comparison
      [norm1, norm2] = await Promise.all([sharp(image1).png().toBuffer(), sharp(image2).png().toBuffer()]);
    } catch (error) {
      logger.warn("PNG conversion failed:", error instanceof Error ? error.message : "Unknown error");
      return false;
    }

    try {
      // Calculate perceptual hashes
      const [hash1, hash2] = await Promise.all([
        getImageHash(norm1), // norm1 is now Buffer
        getImageHash(norm2), // norm2 is now Buffer
      ]);

      // Compare hashes
      return hash1 === hash2;
    } catch (error) {
      logger.warn("Hash generation failed:", error instanceof ImageCompareError ? error.message : "Unknown error");
      return false;
    }
  } catch (error) {
    // Log any unexpected errors and return false
    if (error instanceof ImageCompareError) {
      throw error;
    }
    logger.error("Unexpected error during image comparison:", error instanceof Error ? error.message : "Unknown error");
    return false;
  }
}
