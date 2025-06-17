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

import sharp from "sharp";
import { VALID_IMAGE_FORMATS } from "./constants";

/**
 * Configuration constants for image analysis
 * @internal
 */
const CONFIG = {
  /** Brightness threshold (0-255) that distinguishes light from dark colors */
  BRIGHTNESS_THRESHOLD: 128,

  /** Maximum dimensions for analysis to maintain performance */
  MAX_ANALYSIS_DIMENSION: 512,

  /** Default format for processed images */
  DEFAULT_FORMAT: "png" as const,

  /** Valid image formats */
  FORMATS: VALID_IMAGE_FORMATS,
} as const;

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
 * Legacy interface for backwards compatibility
 * @deprecated Use LogoBrightnessAnalysis instead
 */
export interface LogoInversion {
  /** Average brightness value (0-255) */
  brightness: number;
  /** Whether the logo needs inversion in dark theme */
  needsDarkInversion: boolean;
  /** Whether the logo needs inversion in light theme */
  needsLightInversion: boolean;
  /** Whether the logo has transparency */
  hasTransparency: boolean;
  /** Image format (e.g., 'png', 'jpeg') */
  format: string;
  /** Image dimensions */
  dimensions: {
    /** Width in pixels */
    width: number;
    /** Height in pixels */
    height: number;
  };
}

/**
 * Results of analyzing a logo's brightness and characteristics
 * @interface
 */
export interface LogoBrightnessAnalysis {
  /** Average brightness value (0-255) */
  averageBrightness: number;
  /** Whether the logo is predominantly light-colored */
  isLightColored: boolean;
  /** Whether the logo needs inversion in light theme for contrast */
  needsInversionInLightTheme: boolean;
  /** Whether the logo needs inversion in dark theme for contrast */
  needsInversionInDarkTheme: boolean;
  /** Whether the logo contains transparent pixels */
  hasTransparency: boolean;
  /** Image format (e.g., 'png', 'jpeg') */
  format: string;
  /** Image dimensions */
  dimensions: {
    /** Width in pixels */
    width: number;
    /** Height in pixels */
    height: number;
  };
}

/**
 * Converts new analysis format to legacy format for backwards compatibility
 * @param {LogoBrightnessAnalysis} analysis - New format analysis results
 * @returns {LogoInversion} Legacy format analysis results
 * @internal
 *
 * @example
 * ```typescript
 * const newAnalysis = await analyzeLogo(buffer);
 * const legacyFormat = convertToLegacyFormat(newAnalysis);
 * ```
 */
function convertToLegacyFormat(analysis: LogoBrightnessAnalysis): LogoInversion {
  return {
    brightness: analysis.averageBrightness,
    needsDarkInversion: analysis.needsInversionInDarkTheme,
    needsLightInversion: analysis.needsInversionInLightTheme,
    hasTransparency: analysis.hasTransparency,
    format: analysis.format,
    dimensions: analysis.dimensions,
  };
}

/**
 * Validates image format and dimensions
 * @param {sharp.Metadata} metadata - Image metadata from Sharp
 * @returns {void}
 * @throws {ImageAnalysisError} If image format or dimensions are invalid
 * @internal
 *
 * @example
 * ```typescript
 * const metadata = await sharp(buffer).metadata();
 * validateImage(metadata); // Throws if invalid
 * ```
 */
function validateImage(metadata: sharp.Metadata): void {
  const formatStr = metadata.format as string;
  if (
    !formatStr ||
    !CONFIG.FORMATS.includes(formatStr as "png" | "jpeg" | "webp" | "gif" | "svg" | "ico")
  ) {
    throw new ImageAnalysisError(
      `Invalid image format: ${metadata.format}. Must be one of: ${CONFIG.FORMATS.join(", ")}`,
    );
  }

  if (!metadata.width || !metadata.height || metadata.width < 1 || metadata.height < 1) {
    throw new ImageAnalysisError(
      `Invalid image dimensions: ${metadata.width}x${metadata.height}. Must be positive numbers.`,
    );
  }
}

/**
 * Analyzes a logo's brightness and characteristics to determine if it needs inversion
 * @param {Buffer} buffer - Logo image buffer to analyze
 * @returns {Promise<LogoBrightnessAnalysis>} Comprehensive analysis results
 * @throws {ImageAnalysisError} If the image is invalid or analysis fails
 *
 * @example
 * ```typescript
 * const buffer = await fs.readFile('logo.png');
 * const analysis = await analyzeLogo(buffer);
 *
 * if (analysis.isLightColored) {
 *   console.log('Light logo detected');
 * }
 *
 * if (analysis.hasTransparency) {
 *   console.log('Logo contains transparency');
 * }
 * ```
 */
export async function analyzeLogo(buffer: Buffer): Promise<LogoBrightnessAnalysis> {
  const image = sharp(buffer, { pages: 1 }); // Handle multi-page ICO files
  const metadata = await image.metadata();

  // Validate format and dimensions
  validateImage(metadata);

  const width = metadata.width || CONFIG.MAX_ANALYSIS_DIMENSION;
  const height = metadata.height || CONFIG.MAX_ANALYSIS_DIMENSION;

  // Resize for consistent analysis
  const resized = image
    .resize(
      Math.min(width, CONFIG.MAX_ANALYSIS_DIMENSION),
      Math.min(height, CONFIG.MAX_ANALYSIS_DIMENSION),
      {
        fit: "inside",
        withoutEnlargement: true,
      },
    )
    .raw()
    .grayscale();

  const { data, info } = await resized.toBuffer({ resolveWithObject: true });
  const pixels = new Uint8Array(data.buffer);

  // Calculate average brightness
  let totalBrightness = 0;
  let totalPixels = 0;
  let hasTransparency = false;

  for (let i = 0; i < pixels.length; i += info.channels) {
    const brightness = pixels[i];
    const alpha = info.channels === 4 ? pixels[i + 3] : 255;

    if (alpha !== undefined && alpha < 255) {
      hasTransparency = true;
    }

    if (alpha !== undefined && alpha > 0) {
      totalBrightness += brightness !== undefined ? brightness : 0;
      totalPixels++;
    }
  }

  const averageBrightness = totalPixels > 0 ? totalBrightness / totalPixels : 0;
  const isLightColored = averageBrightness >= CONFIG.BRIGHTNESS_THRESHOLD;

  return {
    averageBrightness,
    isLightColored,
    // For a light logo:
    // - Light theme: needs inversion (dark background needed for visibility)
    // - Dark theme: no inversion (already visible against dark background)
    // For a dark logo:
    // - Light theme: no inversion (already visible against light background)
    // - Dark theme: needs inversion (light background needed for visibility)
    needsInversionInLightTheme: isLightColored,
    needsInversionInDarkTheme: !isLightColored,
    hasTransparency: hasTransparency || metadata.hasAlpha === true,
    format: metadata.format || CONFIG.DEFAULT_FORMAT,
    dimensions: {
      width: metadata.width || CONFIG.MAX_ANALYSIS_DIMENSION,
      height: metadata.height || CONFIG.MAX_ANALYSIS_DIMENSION,
    },
  };
}

/**
 * Inverts a logo's colors while optionally preserving transparency
 * @param {Buffer} buffer - Logo image buffer to invert
 * @param {boolean} [preserveTransparency=true] - Whether to preserve transparency
 * @returns {Promise<Buffer>} Inverted logo buffer in PNG format
 * @throws {ImageAnalysisError} If the image is invalid or inversion fails
 *
 * @example
 * ```typescript
 * // Invert colors and preserve transparency
 * const inverted = await invertLogo(buffer);
 *
 * // Invert colors without preserving transparency
 * const solid = await invertLogo(buffer, false);
 * ```
 */
export async function invertLogo(buffer: Buffer, preserveTransparency = true): Promise<Buffer> {
  const image = sharp(buffer, { pages: 1 }); // Handle multi-page ICO files
  const metadata = await image.metadata();

  // Validate format
  validateImage(metadata);

  if (preserveTransparency && metadata.hasAlpha) {
    // Extract alpha channel
    const alpha = image.clone().extractChannel(3);

    // Invert colors and recombine with original alpha
    return image
      .negate({ alpha: false })
      .joinChannel(await alpha.toBuffer())
      .png()
      .toBuffer();
  }

  // Simple inversion for non-transparent images
  return image.negate().png().toBuffer();
}

/**
 * Determines if a logo needs color inversion based on the current theme
 * @param {Buffer} buffer - Logo image buffer to check
 * @param {boolean} isDarkTheme - Whether the current theme is dark mode
 * @returns {Promise<boolean>} Whether the logo needs inversion for optimal contrast
 * @throws {ImageAnalysisError} If the image is invalid or analysis fails
 *
 * @example
 * ```typescript
 * // Check if logo needs inversion in dark mode
 * const needsInversion = await doesLogoNeedInversion(buffer, true);
 *
 * // Check if logo needs inversion in light mode
 * const needsInversion = await doesLogoNeedInversion(buffer, false);
 * ```
 */
export async function doesLogoNeedInversion(
  buffer: Buffer,
  isDarkTheme: boolean,
): Promise<boolean> {
  const analysis = await analyzeLogo(buffer);
  return isDarkTheme ? analysis.needsInversionInDarkTheme : analysis.needsInversionInLightTheme;
}

/**
 * Legacy exports for backwards compatibility
 * @deprecated Use the new function names instead
 */
export async function analyzeImage(buffer: Buffer): Promise<LogoInversion> {
  const analysis = await analyzeLogo(buffer);
  return convertToLegacyFormat(analysis);
}

/** @deprecated Use invertLogo instead */
export const invertImage = invertLogo;

/** @deprecated Use doesLogoNeedInversion instead */
export const needsInversion = doesLogoNeedInversion;
