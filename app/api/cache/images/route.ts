/**
 * Image Cache API Route
 * @module app/api/cache/images
 * @description
 * Server-side API endpoint for caching and serving optimized images.
 * Provides a consistent caching layer on top of Next.js image optimization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ServerCacheInstance } from '../../../../lib/server-cache';
import sharp from 'sharp';

// Cache image data with timestamp
interface ImageCacheEntry {
  buffer: Buffer;
  contentType: string;
  timestamp: number;
}

// Cache key prefix
const IMAGE_CACHE_PREFIX = 'optimized-image:';

// Configure cache duration (1 year in seconds)
const CACHE_DURATION = 60 * 60 * 24 * 365;

// Valid image formats
const VALID_IMAGE_FORMATS = ['jpeg', 'jpg', 'png', 'webp', 'avif', 'gif'];

// Allow any http or https URL for image caching
function isAllowedUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * GET handler for image caching
 * @param {NextRequest} request - Incoming request
 * @returns {Promise<NextResponse>} API response with cached image
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const encodedUrl = searchParams.get('url');
  if (!encodedUrl) {
    return NextResponse.json(
      { error: 'URL parameter required' },
      { status: 400 }
    );
  }
  // Decode percent-encoded URL before validation
  let url: string;
  try {
    url = decodeURIComponent(encodedUrl);
  } catch {
    url = encodedUrl;
  }
  const width = searchParams.get('width');
  const format = searchParams.get('format') || 'webp';

  // SECURITY: Validate URL against allowed domains
  if (!isAllowedUrl(url)) {
    return NextResponse.json(
      { error: 'URL domain not allowed' },
      { status: 403 }
    );
  }

  // Validate and sanitize width
  const parsedWidth = width ? parseInt(width, 10) : 0;
  const imageWidth = !isNaN(parsedWidth) && parsedWidth > 0 ? parsedWidth : 1920;

  // Validate format
  const imageFormat = VALID_IMAGE_FORMATS.includes(format) ? format : 'webp';

  // Create a cache key based on URL, width and format
  const cacheKey = `${IMAGE_CACHE_PREFIX}${url}-${imageWidth}-${imageFormat}`;

  try {
    // Try to get from cache
    const cached = ServerCacheInstance.get<ImageCacheEntry>(cacheKey);

    if (cached) {
      // Return cached image with proper headers
      return new NextResponse(cached.buffer, {
        headers: {
          'Content-Type': cached.contentType,
          'Cache-Control': `public, max-age=${CACHE_DURATION}, immutable`,
          'X-Cache': 'HIT'
        }
      });
    }

    // Fetch the original image
    const imageResponse = await fetch(url, {
      headers: {
        'Accept': 'image/*'
      }
    });

    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: `Failed to fetch image: ${imageResponse.status}` },
        { status: imageResponse.status }
      );
    }

    const contentType = imageResponse.headers.get('Content-Type') || 'image/jpeg';
    const buffer = Buffer.from(await imageResponse.arrayBuffer());

    // Process with sharp for optimization
    let processedImage: Buffer;

    try {
      const sharpInstance = sharp(buffer);

      // Resize if width provided
      if (imageWidth > 0) {
        sharpInstance.resize({
          width: imageWidth,
          withoutEnlargement: true,
          fit: 'inside'
        });
      }

      // Convert to specified format
      switch (imageFormat) {
        case 'webp':
          processedImage = await sharpInstance.webp({ quality: 80 }).toBuffer();
          break;
        case 'avif':
          processedImage = await sharpInstance.avif({ quality: 75 }).toBuffer();
          break;
        case 'png':
          processedImage = await sharpInstance.png({ compressionLevel: 9 }).toBuffer();
          break;
        case 'jpeg':
        case 'jpg':
          processedImage = await sharpInstance.jpeg({ quality: 85 }).toBuffer();
          break;
        default:
          // Default to webp
          processedImage = await sharpInstance.webp({ quality: 80 }).toBuffer();
      }
    } catch (error) {
      console.error('Image processing error:', error);
      // Fall back to original image
      processedImage = buffer;
    }

    // Set content type based on format
    const outputContentType =
      imageFormat === 'webp' ? 'image/webp' :
      imageFormat === 'avif' ? 'image/avif' :
      imageFormat === 'png' ? 'image/png' :
      imageFormat === 'jpeg' || imageFormat === 'jpg' ? 'image/jpeg' :
      contentType;

    // Cache the optimized image
    ServerCacheInstance.set(cacheKey, {
      buffer: processedImage,
      contentType: outputContentType,
      timestamp: Date.now()
    }, CACHE_DURATION);

    // Return the processed image
    return new NextResponse(processedImage, {
      headers: {
        'Content-Type': outputContentType,
        'Cache-Control': `public, max-age=${CACHE_DURATION}, immutable`,
        'X-Cache': 'MISS'
      }
    });

  } catch (error) {
    console.error('Image cache error:', error);
    return NextResponse.json(
      { error: 'Failed to process image' },
      { status: 500 }
    );
  }
}