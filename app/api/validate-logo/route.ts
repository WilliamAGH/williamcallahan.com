/**
 * Logo Validation API Route
 * @module app/api/validate-logo
 * @description
 * Server-side API endpoint for validating logo images.
 * This route handles image validation and comparison to detect generic globe icons.
 */

import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { ServerCache } from '../../../lib/server-cache';
import { VALID_IMAGE_FORMATS, MIN_LOGO_SIZE } from '../../../lib/constants';

/** Reference globe icon buffer - loaded once and reused */
let referenceGlobeIcon: Buffer | null = null;

/**
 * Calculate perceptual hash of an image
 * @param {Buffer} buffer - Image buffer to hash
 * @returns {Promise<string>} Hash of the image
 */
async function getImageHash(buffer: Buffer): Promise<string> {
  try {
    const normalized = await sharp(buffer)
      .resize(16, 16, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer();

    return createHash('sha256').update(normalized).digest('hex');
  } catch (error) {
    console.error('Error generating image hash:', error);
    return '';
  }
}

/**
 * Compare two images for similarity
 * @param {Buffer} image1 - First image buffer
 * @param {Buffer} image2 - Second image buffer
 * @returns {Promise<boolean>} True if images are similar
 */
async function compareImages(image1: Buffer, image2: Buffer): Promise<boolean> {
  try {
    // Validate image formats first
    const [meta1, meta2] = await Promise.all([
      sharp(image1).metadata(),
      sharp(image2).metadata()
    ]);

    // Basic format validation
    if (!meta1.format || !meta2.format ||
        !VALID_IMAGE_FORMATS.includes(meta1.format as any) ||
        !VALID_IMAGE_FORMATS.includes(meta2.format as any)) {
      console.debug('Invalid image format detected');
      return false;
    }

    // Basic size validation
    if (!meta1.width || !meta2.width || !meta1.height || !meta2.height ||
        meta1.width < MIN_LOGO_SIZE || meta1.height < MIN_LOGO_SIZE ||
        meta2.width < MIN_LOGO_SIZE || meta2.height < MIN_LOGO_SIZE) {
      console.debug('Invalid image dimensions');
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

    if (!hash1 || !hash2) {
      return false;
    }

    return hash1 === hash2;
  } catch (error) {
    console.error('Error comparing images:', error);
    return false;
  }
}

/**
 * Load reference globe icon
 * @returns {Promise<void>}
 */
async function loadReferenceIcon(): Promise<void> {
  if (referenceGlobeIcon) return;
  try {
    referenceGlobeIcon = await fs.readFile(path.join(process.cwd(), 'public/images/reference-globe-icon.png'));
  } catch (error) {
    console.warn('Failed to load reference globe icon:', error);
  }
}

/**
 * POST handler for logo validation
 * @param {NextRequest} request - Incoming request
 * @returns {Promise<NextResponse>} API response
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  await loadReferenceIcon();

  if (!referenceGlobeIcon) {
    return NextResponse.json({ isGlobeIcon: false });
  }

  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File;
    if (!imageFile) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await imageFile.arrayBuffer());

    // Check cache first
    const imageHash = await getImageHash(buffer);
    const cached = ServerCache.getLogoValidation(imageHash);
    if (cached) {
      return NextResponse.json({ isGlobeIcon: cached.isGlobeIcon });
    }

    // Compare with reference icon
    const isGlobeIcon = await compareImages(buffer, referenceGlobeIcon);

    // Cache the result
    ServerCache.setLogoValidation(imageHash, isGlobeIcon);

    return NextResponse.json({ isGlobeIcon });
  } catch (error) {
    console.error('Error validating logo:', error);
    return NextResponse.json({ error: 'Failed to validate logo' }, { status: 500 });
  }
}
