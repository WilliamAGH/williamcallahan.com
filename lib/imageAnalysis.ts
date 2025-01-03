/**
 * Logo Brightness Analysis Module
 * @module lib/imageAnalysis
 * @description
 * Analyzes logo images to determine if they need color inversion
 * to maintain visibility against light/dark backgrounds.
 */

import sharp from 'sharp';
import { VALID_IMAGE_FORMATS } from './constants';

/** Brightness threshold (0-255) that distinguishes light from dark colors */
const BRIGHTNESS_THRESHOLD = 128;

/** Maximum dimensions for analysis to maintain performance */
const MAX_ANALYSIS_DIMENSION = 512;

/** Default format for processed images */
const DEFAULT_FORMAT = 'png';

/** Legacy interface for backwards compatibility */
export interface LogoInversion {
  brightness: number;
  needsDarkInversion: boolean;
  needsLightInversion: boolean;
  hasTransparency: boolean;
  format: string;
  dimensions: {
    width: number;
    height: number;
  };
}

/** Results of analyzing a logo's brightness */
interface LogoBrightnessAnalysis {
  /** Average brightness value (0-255) */
  averageBrightness: number;
  /** Whether the logo is light-colored */
  isLightColored: boolean;
  /** Whether the logo needs inversion in light theme for contrast */
  needsInversionInLightTheme: boolean;
  /** Whether the logo needs inversion in dark theme for contrast */
  needsInversionInDarkTheme: boolean;
  /** Whether the logo has transparency */
  hasTransparency: boolean;
  /** Image format */
  format: string;
  /** Image dimensions */
  dimensions: {
    width: number;
    height: number;
  };
}

/**
 * Convert new analysis format to legacy format
 * @param {LogoBrightnessAnalysis} analysis - New format analysis
 * @returns {LogoInversion} Legacy format analysis
 */
function convertToLegacyFormat(analysis: LogoBrightnessAnalysis): LogoInversion {
  return {
    brightness: analysis.averageBrightness,
    needsDarkInversion: analysis.needsInversionInDarkTheme,
    needsLightInversion: analysis.needsInversionInLightTheme,
    hasTransparency: analysis.hasTransparency,
    format: analysis.format,
    dimensions: analysis.dimensions
  };
}

/**
 * Validate image format and dimensions
 * @param {sharp.Metadata} metadata - Image metadata
 * @returns {void}
 * @throws {Error} If image format or dimensions are invalid
 */
function validateImage(metadata: sharp.Metadata): void {
  if (!metadata.format || !VALID_IMAGE_FORMATS.includes(metadata.format as any)) {
    throw new Error('Invalid image format');
  }

  if (!metadata.width || !metadata.height || metadata.width < 1 || metadata.height < 1) {
    throw new Error('Invalid image dimensions');
  }
}

/**
 * Analyze a logo's brightness to determine if it needs inversion
 * @param {Buffer} buffer - Logo image buffer to analyze
 * @returns {Promise<LogoBrightnessAnalysis>} Analysis results
 */
export async function analyzeLogo(buffer: Buffer): Promise<LogoBrightnessAnalysis> {
  const image = sharp(buffer, { pages: 1 }); // Handle multi-page ICO files
  const metadata = await image.metadata();

  // Validate format and dimensions
  validateImage(metadata);

  const width = metadata.width || MAX_ANALYSIS_DIMENSION;
  const height = metadata.height || MAX_ANALYSIS_DIMENSION;

  // Resize for consistent analysis
  const resized = image
    .resize(Math.min(width, MAX_ANALYSIS_DIMENSION), Math.min(height, MAX_ANALYSIS_DIMENSION), {
      fit: 'inside',
      withoutEnlargement: true
    })
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

    if (alpha < 255) {
      hasTransparency = true;
    }

    if (alpha > 0) {
      totalBrightness += brightness;
      totalPixels++;
    }
  }

  const averageBrightness = totalPixels > 0 ? totalBrightness / totalPixels : 0;
  const isLightColored = averageBrightness >= BRIGHTNESS_THRESHOLD;

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
    format: metadata.format || DEFAULT_FORMAT,
    dimensions: {
      width: metadata.width || MAX_ANALYSIS_DIMENSION,
      height: metadata.height || MAX_ANALYSIS_DIMENSION
    }
  };
}

/**
 * Invert a logo's colors while preserving transparency
 * @param {Buffer} buffer - Logo image buffer to invert
 * @param {boolean} preserveTransparency - Whether to preserve transparency
 * @returns {Promise<Buffer>} Inverted logo buffer
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
  return image
    .negate()
    .png()
    .toBuffer();
}

/**
 * Check if a logo needs color inversion based on the current theme
 * @param {Buffer} buffer - Logo image buffer to check
 * @param {boolean} isDarkTheme - Whether current theme is dark
 * @returns {Promise<boolean>} Whether the logo needs inversion
 */
export async function doesLogoNeedInversion(buffer: Buffer, isDarkTheme: boolean): Promise<boolean> {
  const analysis = await analyzeLogo(buffer);
  return isDarkTheme ? analysis.needsInversionInDarkTheme : analysis.needsInversionInLightTheme;
}

// Legacy exports for backwards compatibility
export async function analyzeImage(buffer: Buffer): Promise<LogoInversion> {
  const analysis = await analyzeLogo(buffer);
  return convertToLegacyFormat(analysis);
}
export const invertImage = invertLogo;
export const needsInversion = doesLogoNeedInversion;
