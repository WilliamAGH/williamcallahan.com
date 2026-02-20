/**
 * OpenGraph Image Validation
 * @module lib/seo/og-validation
 * @description
 * Validates OpenGraph images according to social media platform requirements
 * Based on Twitter Cards troubleshooting guide and OpenGraph best practices
 */

import { metadata } from "@/data/metadata";
import type { OGImageValidation, OGImage, OGMetadata } from "../../types/seo/validation";
import { FIXED_BUILD_TIMESTAMP } from "@/lib/utils";

/**
 * Validates an OpenGraph image URL according to platform requirements
 * @param imageUrl - The image URL to validate
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @returns Validation result with errors and recommendations
 */
export function validateOGImage(
  imageUrl: string,
  width?: number,
  height?: number,
): OGImageValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  // Check if URL is absolute
  if (
    !imageUrl.startsWith("http://") &&
    !imageUrl.startsWith("https://") &&
    !imageUrl.startsWith("/")
  ) {
    errors.push("Image URL must be absolute or root-relative");
  }

  // Check if URL is publicly accessible (basic validation)
  if (imageUrl.includes("localhost") || imageUrl.includes("127.0.0.1")) {
    errors.push(
      "Image URL appears to be localhost - social media crawlers cannot access local URLs",
    );
  }

  // Validate dimensions
  if (width && height) {
    // Twitter minimum requirements
    if (width < 144 || height < 144) {
      errors.push("Image dimensions are too small (minimum 144x144 pixels)");
    }

    // Recommended dimensions for Twitter Cards
    if (width < 300 || height < 157) {
      warnings.push("Image dimensions are below Twitter Cards recommendation (300x157 minimum)");
    }

    // Optimal dimensions
    if (width < 1200 || height < 630) {
      recommendations.push("Consider using larger images (1200x630) for better display quality");
    }

    // Check aspect ratio
    const aspectRatio = width / height;
    if (aspectRatio < 1.85 || aspectRatio > 2.1) {
      warnings.push("Image aspect ratio should be close to 1.91:1 for optimal display");
    }
  } else {
    warnings.push("Image dimensions not provided - cannot validate size requirements");
  }

  // Check file extension
  const supportedFormats = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
  const urlPath = imageUrl.split("?")[0]?.split("#")[0] ?? imageUrl;
  const hasValidExtension = supportedFormats.some((ext) => urlPath.toLowerCase().endsWith(ext));

  if (!hasValidExtension) {
    warnings.push("Image format may not be supported - use JPG, PNG, GIF, or WebP");
  }

  // Check for cache busting
  if (!imageUrl.includes("?") && !imageUrl.includes("#")) {
    recommendations.push(
      "Consider adding cache-busting parameters to force social media re-crawling",
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    recommendations,
  };
}

/**
 * Validates all OpenGraph metadata for a page
 * @param ogData - The OpenGraph metadata object
 * @returns Validation result
 */
export function validateOpenGraphMetadata(ogData: OGMetadata): OGImageValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  // Required properties
  if (!ogData.title) {
    errors.push("OpenGraph title is required");
  } else if (ogData.title.length > 60) {
    warnings.push("OpenGraph title is longer than recommended 60 characters");
  }

  if (!ogData.description) {
    errors.push("OpenGraph description is required");
  } else if (ogData.description.length > 160) {
    warnings.push("OpenGraph description is longer than recommended 160 characters");
  }

  if (!ogData.url) {
    errors.push("OpenGraph URL is required");
  }

  if (!ogData.type) {
    errors.push("OpenGraph type is required");
  }

  // Image validation
  if (!ogData.images || !Array.isArray(ogData.images) || ogData.images.length === 0) {
    errors.push("At least one OpenGraph image is required");
  } else {
    ogData.images.forEach((image: OGImage, index: number) => {
      const imageValidation = validateOGImage(image.url, image.width, image.height);

      if (!imageValidation.isValid) {
        errors.push(...imageValidation.errors.map((err) => `Image ${index + 1}: ${err}`));
      }

      warnings.push(...imageValidation.warnings.map((warn) => `Image ${index + 1}: ${warn}`));
      recommendations.push(
        ...imageValidation.recommendations.map((rec) => `Image ${index + 1}: ${rec}`),
      );
    });
  }

  // Site-specific validation
  if (!ogData.siteName) {
    warnings.push("OpenGraph siteName is recommended for better branding");
  }

  if (!ogData.locale) {
    warnings.push("OpenGraph locale is recommended for internationalization");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    recommendations,
  };
}

/**
 * Creates a cache-busting URL for OpenGraph images.
 * Uses FIXED_BUILD_TIMESTAMP to stay compatible with Next.js 16 prerendering
 * (calling Date.now / performance.now before uncached data access is forbidden).
 * OG images are static assets that change only at deploy time, so a build-stamp
 * version parameter is sufficient.
 */
export function createCacheBustingUrl(imageUrl: string, forceRefresh = false): string {
  const separator = imageUrl.includes("?") ? "&" : "?";
  const buildDay = Math.floor(FIXED_BUILD_TIMESTAMP / (1000 * 60 * 60 * 24));

  if (forceRefresh) {
    return `${imageUrl}${separator}cb=${FIXED_BUILD_TIMESTAMP}`;
  }

  return `${imageUrl}${separator}v=${buildDay}`;
}

/**
 * Ensures an image URL meets all social media platform requirements
 * @param imageUrl - The image URL to process
 * @param width - Image width
 * @param height - Image height
 * @param forceRefresh - Whether to force cache refresh
 * @returns Processed and validated image URL
 */
export function prepareOGImageUrl(
  imageUrl: string,
  width?: number,
  height?: number,
  forceRefresh = false,
): string {
  // Handle URLs - they might already be absolute S3 CDN URLs
  let processedUrl = imageUrl;

  // Only make relative URLs absolute
  if (imageUrl.startsWith("/")) {
    processedUrl = `${metadata.site.url}${imageUrl}`;
  }

  // Validate the image
  const validation = validateOGImage(processedUrl, width, height);

  if (!validation.isValid) {
    console.warn("OpenGraph image validation failed:", validation.errors);
    // Fall back to default image - check if it's already an S3 URL
    const defaultImageUrl = metadata.defaultImage.url;
    processedUrl = defaultImageUrl.startsWith("http")
      ? defaultImageUrl
      : `${metadata.site.url}${defaultImageUrl}`;
  }

  // Add cache busting
  return createCacheBustingUrl(processedUrl, forceRefresh);
}
