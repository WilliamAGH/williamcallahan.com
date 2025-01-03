/**
 * Image Comparison Module
 * @module lib/imageCompare
 * @description
 * Provides utilities for comparing images using perceptual hashing.
 * This module is used to detect generic globe icons and ensure
 * we only display actual company logos.
 */

import sharp from 'sharp';
import { createHash } from 'crypto';
import { VALID_IMAGE_FORMATS, MIN_LOGO_SIZE, MAX_SIZE_DIFF } from './constants';

/**
 * Image metadata with validation
 * @interface
 */
interface ValidatedMetadata {
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Image format (e.g., 'jpeg', 'png') */
  format: string;
  /** Whether the image meets validation criteria */
  isValid: boolean;
}

/**
 * Get image metadata with validation
 * @param {Buffer} buffer - Image buffer to analyze
 * @returns {Promise<ValidatedMetadata>} Image metadata and validation result
 * @throws {Error} If image processing fails
 */
async function getValidatedMetadata(buffer: Buffer): Promise<ValidatedMetadata> {
  const metadata = await sharp(buffer).metadata();

  const width = metadata.width || 0;
  const height = metadata.height || 0;
  const format = metadata.format || '';

  const isValid =
    width >= MIN_LOGO_SIZE &&
    height >= MIN_LOGO_SIZE &&
    VALID_IMAGE_FORMATS.includes(format as any);

  return {
    width,
    height,
    format,
    isValid
  };
}

/**
 * Calculate perceptual hash of an image
 * @param {Buffer} buffer - Image buffer to hash
 * @returns {Promise<string>} Image hash
 * @throws {Error} If image processing fails
 */
async function getImageHash(buffer: Buffer): Promise<string> {
  // Normalize image for consistent hashing:
  // - Resize to 16x16 (small enough for quick comparison, big enough for details)
  // - Convert to grayscale (remove color variations)
  // - Get raw pixel data
  const normalized = await sharp(buffer)
    .resize(16, 16, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer();

  // Create SHA-256 hash of normalized pixel data
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Compare two images to determine if they're perceptually similar
 * @param {Buffer} image1 - First image buffer
 * @param {Buffer} image2 - Second image buffer
 * @returns {Promise<boolean>} True if images are similar
 * @throws {Error} If image processing fails
 * @remarks
 * This function uses a multi-step comparison process:
 * 1. Validates image formats and dimensions
 * 2. Converts images to a normalized format
 * 3. Generates perceptual hashes
 * 4. Compares hashes for similarity
 */
export async function compareImages(image1: Buffer, image2: Buffer): Promise<boolean> {
  try {
    // Get and validate metadata for both images
    const [meta1, meta2] = await Promise.all([
      getValidatedMetadata(image1),
      getValidatedMetadata(image2)
    ]);

    // Check if both images are valid
    if (!meta1.isValid || !meta2.isValid) {
      return false;
    }

    // Check if sizes are too different
    const sizeDiff = Math.abs(meta1.width - meta2.width) +
                    Math.abs(meta1.height - meta2.height);
    if (sizeDiff > MAX_SIZE_DIFF) {
      return false;
    }

    // Convert both images to PNG for consistent comparison
    const [norm1, norm2] = await Promise.all([
      sharp(image1).png().toBuffer(),
      sharp(image2).png().toBuffer()
    ]);

    // Calculate perceptual hashes
    const [hash1, hash2] = await Promise.all([
      getImageHash(norm1),
      getImageHash(norm2)
    ]);

    // Compare hashes
    return hash1 === hash2;
  } catch (error) {
    console.error('Error comparing images:', error);
    return false;
  }
}
