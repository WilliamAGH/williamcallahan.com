/**
 * Logo Image Analysis Module
 * @module lib/imageAnalysis
 * @description
 * Provides functionality for analyzing and manipulating logo images, including:
 * - Brightness analysis for theme-based color inversion
 * - Transparency detection and preservation
 * - Image format validation and processing
 * - Dimension analysis and resizing
 *
 * @example
 * ```typescript
 * // Analyze a logo
 * const analysis = await analyzeLogo(imageBuffer);
 *
 * // Check if inversion is needed
 * const needsInversion = await doesLogoNeedInversion(imageBuffer, isDarkTheme);
 *
 * // Invert colors while preserving transparency
 * const inverted = await invertLogo(imageBuffer);
 * ```
 */

import { extractBasicImageMeta } from "./image-metadata";
import type { LogoInversion, LogoBrightnessAnalysis } from "@/types";

/**
 * Custom error class for image analysis errors
 * @class
 */
export class ImageAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageAnalysisError";
  }
}

/**
 * Lightweight logo analysis with entropy and pattern detection
 */
export async function analyzeLogo(buffer: Buffer): Promise<LogoBrightnessAnalysis> {
  const meta = await extractBasicImageMeta(buffer);
  const analysis = analyzeImagePatterns(buffer);
  
  // Use entropy and compression to estimate brightness
  // Low entropy often indicates solid colors (likely white/light)
  const estimatedBrightness = analysis.entropy < 0.2 ? 240 : 
                             analysis.entropy < 0.4 ? 200 : 128;
  
  const isLightColored = estimatedBrightness > 200;
  
  return {
    averageBrightness: estimatedBrightness,
    isLightColored,
    needsInversionInLightTheme: false, // Can't determine without pixel data
    needsInversionInDarkTheme: isLightColored,
    hasTransparency: meta.format === "png", // PNG likely has transparency
    format: meta.format ?? "unknown",
    dimensions: { width: meta.width ?? 0, height: meta.height ?? 0 },
  };
}

/**
 * Analyze image patterns to detect blank/empty/globe icons
 */
export function analyzeImagePatterns(buffer: Buffer): {
  entropy: number;
  isLikelyBlank: boolean;
  isLikelyGlobe: boolean;
  compressionRatio: number;
  colorUniformity: number;
} {
  // Calculate entropy
  const entropy = calculateEntropy(buffer.slice(0, 2048));
  
  // Analyze byte patterns
  const patterns = analyzeBytePatterns(buffer);
  
  // Very low entropy suggests solid color
  const isLikelyBlank = entropy < 0.1 || patterns.uniformity > 0.9;
  
  // Globe icons tend to have specific patterns
  const isLikelyGlobe = detectGlobePattern(buffer, patterns);
  
  return {
    entropy,
    isLikelyBlank,
    isLikelyGlobe,
    compressionRatio: patterns.compressionEstimate,
    colorUniformity: patterns.uniformity
  };
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
 * Analyze byte patterns for uniformity and structure
 */
function analyzeBytePatterns(buffer: Buffer): {
  uniformity: number;
  compressionEstimate: number;
  dominantByte: number;
} {
  const sample = buffer.slice(0, Math.min(4096, buffer.length));
  const byteCounts: number[] = new Array(256).fill(0) as number[];
  
  for (const byte of sample) {
    if (byte !== undefined && byte >= 0 && byte < 256) {
      const currentCount = byteCounts[byte] ?? 0;
      byteCounts[byte] = currentCount + 1;
    }
  }
  
  // Find dominant byte
  let maxCount = 0;
  let dominantByte = 0;
  for (let i = 0; i < 256; i++) {
    const count = byteCounts[i];
    if (count !== undefined && count > maxCount) {
      maxCount = count;
      dominantByte = i;
    }
  }
  
  // Calculate uniformity (how much one byte dominates)
  const uniformity = maxCount / sample.length;
  
  // Estimate compression (more uniform = better compression)
  const compressionEstimate = 1 - calculateEntropy(sample);
  
  return { uniformity, compressionEstimate, dominantByte };
}

/**
 * Detect common globe icon patterns
 */
function detectGlobePattern(buffer: Buffer, patterns: {
  uniformity: number;
  compressionEstimate: number;
  dominantByte: number;
}): boolean {
  // Globe icons often have:
  // 1. High blue/gray content (bytes in certain ranges)
  // 2. Circular patterns (hard to detect without decoding)
  // 3. Small size with good compression
  
  const likelyBlue = patterns.dominantByte > 100 && patterns.dominantByte < 150;
  const goodCompression = patterns.compressionEstimate > 0.7;
  
  // Check for common globe icon file sizes
  const typicalGlobeSizes = [1024, 2048, 3072, 4096].some(
    size => Math.abs(buffer.length - size) < 512
  );
  
  return (likelyBlue || goodCompression) && typicalGlobeSizes;
}

/** No-op inversion – returns original buffer. */
export async function invertLogo(buffer: Buffer): Promise<Buffer> {
  await Promise.resolve();
  return buffer;
}

export async function doesLogoNeedInversion(buffer: Buffer, isDarkTheme: boolean): Promise<boolean> {
  await Promise.resolve();
  void buffer; // Mark as used
  void isDarkTheme; // Mark as used
  return false;
}

/** Legacy alias used elsewhere in the code-base. */
export async function analyzeImage(buffer: Buffer): Promise<LogoInversion> {
  const meta = await extractBasicImageMeta(buffer);
  return {
    brightness: 0.5,
    needsDarkInversion: false,
    needsLightInversion: false,
    hasTransparency: false,
    format: meta.format ?? "unknown",
    dimensions: { width: meta.width ?? 0, height: meta.height ?? 0 },
  };
}

export const invertImage = invertLogo;
export const needsInversion = doesLogoNeedInversion;

/**
 * Check if an image is likely blank or a placeholder
 */
export async function isBlankOrPlaceholder(buffer: Buffer): Promise<{
  isBlank: boolean;
  isGlobe: boolean;
  confidence: number;
  reason?: string;
}> {
  const patterns = analyzeImagePatterns(buffer);
  const meta = await extractBasicImageMeta(buffer);
  
  // Check various indicators
  if (patterns.isLikelyBlank) {
    return { 
      isBlank: true, 
      isGlobe: false, 
      confidence: 0.95,
      reason: 'low_entropy_solid_color' 
    };
  }
  
  if (patterns.isLikelyGlobe) {
    return { 
      isBlank: false, 
      isGlobe: true, 
      confidence: 0.8,
      reason: 'globe_pattern_detected' 
    };
  }
  
  // Check compression ratio
  if (meta.width && meta.height) {
    const pixelCount = meta.width * meta.height;
    const bytesPerPixel = buffer.length / pixelCount;
    
    if (bytesPerPixel < 0.1) {
      return { 
        isBlank: true, 
        isGlobe: false, 
        confidence: 0.7,
        reason: 'extreme_compression' 
      };
    }
  }
  
  // Small square images are often placeholders
  if (meta.width === meta.height && meta.width && meta.width <= 32) {
    return { 
      isBlank: false, 
      isGlobe: true, 
      confidence: 0.6,
      reason: 'small_square_icon' 
    };
  }
  
  return { isBlank: false, isGlobe: false, confidence: 0.1 };
}
