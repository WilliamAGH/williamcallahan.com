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

/**
 * Lightweight image comparison helper with perceptual hashing.
 * Implements multiple similarity detection methods without heavy dependencies.
 */

import { createHash } from "node:crypto";
import { extractBasicImageMeta } from "./image-metadata";
import type { BasicImageMeta, ImageSignature } from "@/types/image";

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
 * Generate a comprehensive signature for an image
 */
export async function generateImageSignature(buffer: Buffer): Promise<ImageSignature> {
  const meta = await extractBasicImageMeta(buffer);

  return {
    exactHash: createHash("sha256").update(buffer).digest("hex"),
    structuralHash: generateStructuralHash(meta, buffer),
    colorSignature: extractColorSignature(buffer),
    fileSize: buffer.length,
    dimensions: {
      width: meta.width || 0,
      height: meta.height || 0,
    },
    format: meta.format ?? "unknown",
    entropy: calculateEntropy(buffer.slice(0, 1024)),
  };
}

/**
 * Generate structural hash based on image metadata
 */
function generateStructuralHash(meta: BasicImageMeta, buffer: Buffer): string {
  const sizeBucket = !meta.width
    ? "unknown"
    : meta.width < 32
      ? "tiny"
      : meta.width < 64
        ? "small"
        : meta.width < 128
          ? "medium"
          : "large";

  const aspect = meta.width && meta.height ? meta.width / meta.height : 1;
  const aspectBucket = aspect < 0.9 ? "tall" : aspect > 1.1 ? "wide" : "square";

  const compressionRatio = meta.width && meta.height ? buffer.length / (meta.width * meta.height) : 0;
  const compressionBucket = compressionRatio < 0.1 ? "high" : compressionRatio < 0.5 ? "medium" : "low";

  return `${sizeBucket}:${aspectBucket}:${compressionBucket}:${meta.format ?? "unknown"}`;
}

/**
 * Extract color signature from buffer without full decoding
 */
function extractColorSignature(buffer: Buffer): number[] {
  // Sample first 2KB for color distribution
  const sample = buffer.slice(0, 2048);
  const histogram: number[] = new Array(8).fill(0) as number[];

  // Simple byte distribution as proxy for color
  for (let i = 0; i < sample.length; i++) {
    const byte = sample[i];
    if (byte === undefined) continue;
    const bucket = Math.floor(byte / 32); // 8 buckets
    const histValue = histogram[bucket];
    if (histValue !== undefined) {
      histogram[bucket] = histValue + 1;
    }
  }

  // Normalize
  const total = histogram.reduce((a, b) => a + b) || 1;
  return histogram.map((count): number => count / total);
}

/**
 * Calculate Shannon entropy of data
 */
function calculateEntropy(data: Buffer): number {
  const counts = new Array(256).fill(0);
  for (const byte of data) {
    counts[byte]++;
  }

  let entropy = 0;
  const len = data.length;
  for (const count of counts) {
    if (count > 0) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }
  }

  return entropy / 8; // Normalize to 0-1
}

/**
 * Compare two image signatures and return similarity score
 */
export function compareSignatures(sig1: ImageSignature, sig2: ImageSignature): number {
  // Exact match
  if (sig1.exactHash === sig2.exactHash) return 1.0;

  let score = 0;
  let weights = 0;

  // Structural similarity (30% weight)
  if (sig1.structuralHash === sig2.structuralHash) {
    score += 0.3;
  }
  weights += 0.3;

  // Dimension similarity (20% weight)
  if (sig1.dimensions.width > 0 && sig2.dimensions.width > 0) {
    const dimSim =
      1 -
      Math.abs(sig1.dimensions.width - sig2.dimensions.width) / Math.max(sig1.dimensions.width, sig2.dimensions.width);
    score += dimSim * 0.2;
  }
  weights += 0.2;

  // Color similarity (30% weight)
  const colorSim = cosineSimilarity(sig1.colorSignature, sig2.colorSignature);
  score += colorSim * 0.3;
  weights += 0.3;

  // File size similarity (10% weight)
  const sizeSim = 1 - Math.abs(sig1.fileSize - sig2.fileSize) / Math.max(sig1.fileSize, sig2.fileSize);
  score += Math.max(0, sizeSim) * 0.1;
  weights += 0.1;

  // Entropy similarity (10% weight)
  const entropySim = 1 - Math.abs(sig1.entropy - sig2.entropy);
  score += entropySim * 0.1;
  weights += 0.1;

  return weights > 0 ? score / weights : 0;
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) return 0;

  const dot = vec1.reduce((sum, val, i) => sum + val * (vec2[i] ?? 0), 0);
  const mag1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
  const mag2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));

  return mag1 > 0 && mag2 > 0 ? dot / (mag1 * mag2) : 0;
}

/**
 * Compares two images to determine if they're perceptually similar
 * @param {Buffer} image1 - First image buffer
 * @param {Buffer} image2 - Second image buffer
 * @param {number} threshold - Similarity threshold (0-1, default 0.9)
 * @returns {Promise<boolean>} True if images are perceptually similar
 */
export async function compareImages(img1: Buffer, img2: Buffer, threshold = 0.9): Promise<boolean> {
  try {
    const sig1 = await generateImageSignature(img1);
    const sig2 = await generateImageSignature(img2);
    const similarity = compareSignatures(sig1, sig2);
    return similarity >= threshold;
  } catch {
    // Fallback to exact match
    const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
    return hash(img1) === hash(img2);
  }
}
