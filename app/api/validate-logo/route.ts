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
import { ServerCacheInstance } from '../../../lib/server-cache';
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
    let meta1, meta2;
    try {
      [meta1, meta2] = await Promise.all([
        sharp(image1).metadata(),
        sharp(image2).metadata()
      ]);
    } catch (error) {
      console.error('Error getting image metadata:', error);
      return false;
    }

    if (!meta1 || !meta2) {
      console.debug('Failed to get image metadata');
      return false;
    }

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
    let norm1, norm2;
    try {
      [norm1, norm2] = await Promise.all([
        sharp(image1).png().toBuffer(),
        sharp(image2).png().toBuffer()
      ]);
    } catch (error) {
      console.error('Error normalizing images:', error);
      return false;
    }

    if (!norm1 || !norm2) {
      console.debug('Failed to normalize images');
      return false;
    }

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
// Enable dynamic rendering to allow API calls during server-side rendering
export const dynamic = 'force-dynamic';
export const revalidate = 3600; // Cache for 1 hour

export async function POST(request: NextRequest): Promise<NextResponse> {
  await loadReferenceIcon();

  if (!referenceGlobeIcon) {
    return NextResponse.json(
      { isGlobeIcon: false },
      {
        headers: {
          'Cache-Control': 'public, max-age=31536000' // 1 year
        }
      }
    );
  }

  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File;
    if (!imageFile) {
      return NextResponse.json(
        { error: 'No image provided' },
        {
          status: 400,
          headers: {
            'Cache-Control': 'no-store'
          }
        }
      );
    }

    const buffer = Buffer.from(await imageFile.arrayBuffer());

    // Check cache first
    const imageHash = await getImageHash(buffer);
    const cached = ServerCacheInstance.getLogoValidation(imageHash);
    if (cached) {
      return NextResponse.json(
        { isGlobeIcon: cached.isGlobeIcon },
        {
          headers: {
            'Cache-Control': 'public, max-age=31536000' // 1 year
          }
        }
      );
    }

    // Compare with reference icon
    const isGlobeIcon = await compareImages(buffer, referenceGlobeIcon);

    // Cache the result
    ServerCacheInstance.setLogoValidation(imageHash, isGlobeIcon);

    return NextResponse.json(
      { isGlobeIcon },
      {
        headers: {
          'Cache-Control': 'public, max-age=31536000' // 1 year
        }
      }
    );
  } catch (error) {
    console.error('Error validating logo:', error);
    return NextResponse.json(
      { error: 'Failed to validate logo' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store'
        }
      }
    );
  }
}
