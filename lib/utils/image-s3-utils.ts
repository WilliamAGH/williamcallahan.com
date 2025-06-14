/**
 * Generic S3 Image Utilities
 *
 * Reusable utilities for storing and retrieving images in S3
 * Used by both logo and OpenGraph systems
 *
 * @module utils/image-s3-utils
 */

import { readBinaryS3, writeBinaryS3 } from '@/lib/s3-utils';
import { processImageBuffer } from '@/lib/data-access/logos/image-processing';
import {
  hashImageContent,
  getOgImageS3Key,
} from '@/lib/utils/opengraph-utils';
import { debug, isDebug } from '@/lib/utils/debug'; // Imported isDebug
import { listS3Objects } from '../s3-utils';

/**
 * Generic function to persist an image to S3 storage
 *
 * @param imageUrl - URL of image to download and persist
 * @param s3Directory - S3 directory to store in (e.g., 'opengraph/images', 'logos')
 * @param logContext - Context for logging (e.g., 'OpenGraph', 'Logo')
 * @param idempotencyKey - A unique key for idempotent storage, like a bookmark ID
 * @param pageUrl - The URL of the page the image belongs to
 * @returns Promise resolving to S3 key or null if failed
 */
export async function persistImageToS3(
  imageUrl: string,
  s3Directory: string,
  logContext = 'Image',
  idempotencyKey?: string,
  pageUrl?: string,
): Promise<string | null> {
  try {
    if (isDebug) debug(`[${logContext}] Attempting to persist image. Original URL: ${imageUrl}, IdempotencyKey: ${idempotencyKey}, PageURL: ${pageUrl}`);

    const response = await fetch(imageUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      const fetchErrorMsg = `Failed to fetch original image: ${response.status} ${response.statusText}`;
      if (isDebug) debug(`[${logContext}] ${fetchErrorMsg} from URL: ${imageUrl}`);
      throw new Error(fetchErrorMsg);
    }
    if (isDebug) debug(`[${logContext}] Successfully fetched original image from: ${imageUrl}`);

    const rawBuffer = Buffer.from(await response.arrayBuffer());

    // Validate minimum image size
    if (rawBuffer.length < 100) {
      const sizeErrorMsg = `Image too small: ${rawBuffer.length} bytes, from URL: ${imageUrl}`;
      if (isDebug) debug(`[${logContext}] ${sizeErrorMsg}`);
      throw new Error(sizeErrorMsg);
    }
    if (isDebug) debug(`[${logContext}] Raw image buffer size: ${rawBuffer.length} bytes for URL: ${imageUrl}`);

    // Process the image (handles SVG detection, PNG conversion, etc.)
    if (isDebug) debug(`[${logContext}] Processing image buffer for: ${imageUrl}`);
    const { processedBuffer, contentType } = await processImageBuffer(rawBuffer);
    if (isDebug) debug(`[${logContext}] Image processed for ${imageUrl}. New size: ${processedBuffer.length} bytes, ContentType: ${contentType}`);

    // Generate S3 key based on idempotency key if available, otherwise fallback to content hash
    const s3Key = getOgImageS3Key(
      imageUrl,
      s3Directory,
      pageUrl,
      idempotencyKey,
      hashImageContent(processedBuffer),
    );
    if (isDebug) debug(`[${logContext}] Generated S3 key: ${s3Key} for image from URL: ${imageUrl}`);

    // Upload to S3
    if (isDebug) debug(`[${logContext}] Attempting to write processed image to S3 with key: ${s3Key}`);
    await writeBinaryS3(s3Key, processedBuffer, contentType);

    if (isDebug) debug(`[${logContext}] Successfully persisted image to S3: ${s3Key} (${processedBuffer.length} bytes) from URL: ${imageUrl}`);
    return s3Key;
  } catch (error) {
    // Ensure error is an instance of Error for consistent message property access
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[${logContext}] Failed to persist image ${imageUrl}:`, errorMessage);
    // Optionally, log the full error object if more details are needed in development
    // if (process.env.NODE_ENV === 'development') {
    //   console.error(`[${logContext}] Full error object for ${imageUrl}:`, error);
    // }
    return null;
  }
}

/**
 * Generic function to check if an image exists in S3 storage
 *
 * @param imageUrl - Original image URL to check for
 * @param s3Directory - S3 directory to check in
 * @param logContext - Context for logging
 * @param idempotencyKey - A unique key for idempotent storage, like a bookmark ID
 * @param pageUrl - The URL of the page the image belongs to
 * @returns Promise resolving to S3 key if found, null if not found
 */
export async function findImageInS3(
  imageUrl: string,
  s3Directory: string,
  logContext = 'Image',
  idempotencyKey?: string,
  pageUrl?: string,
): Promise<string | null> {
  // 1. Direct lookup for the ideal filename based on the full known path
  const idealKey = getOgImageS3Key(imageUrl, s3Directory, pageUrl, idempotencyKey);
  if (isDebug) debug(`[${logContext}] Attempting direct S3 lookup with key: ${idealKey} for image: ${imageUrl}`);
  try {
    const buffer = await readBinaryS3(idealKey);
    if (buffer) {
      if (isDebug) debug(`[${logContext}] Found image by direct key lookup: ${idealKey}`);
      return idealKey;
    }
  } catch (error) { // Catching potential errors from readBinaryS3 if it throws
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (isDebug) debug(`[${logContext}] Error during direct key lookup for ${idealKey}: ${errorMessage}. Proceeding to fallback search.`);
  }

  // 2. Fallback: List objects and search by idempotency key
  // This is the most reliable fallback if the exact URL/hash has changed but the content ID hasn't.
  if (isDebug) debug(`[${logContext}] Direct key lookup failed for ${idealKey}. Proceeding to fallback search by IdempotencyKey: ${idempotencyKey}`);
  try {
    if (idempotencyKey) {
      const allImages = await listS3Objects(s3Directory);
      if (allImages.length > 0) {
        const foundById = allImages.find(key => key.includes(idempotencyKey));
        if (foundById) {
          if (isDebug) debug(`[${logContext}] Fallback search: Found image by ID '${idempotencyKey}': ${foundById}`);
          return foundById;
        }
        if (isDebug) debug(`[${logContext}] Fallback search: IdempotencyKey '${idempotencyKey}' not found in ${allImages.length} listed S3 objects in directory ${s3Directory}.`);
      } else {
        if (isDebug) debug(`[${logContext}] Fallback search: No images found in S3 directory ${s3Directory} to search by IdempotencyKey '${idempotencyKey}'.`);
      }
    } else {
      if (isDebug) debug(`[${logContext}] Fallback search: No IdempotencyKey provided, skipping search by ID for image: ${imageUrl}.`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[${logContext}] Error during fallback S3 object listing in ${s3Directory}:`, errorMessage);
  }

  if (isDebug) debug(`[${logContext}] All S3 lookups failed for image (Original URL: ${imageUrl}, IdempotencyKey: ${idempotencyKey}, PageURL: ${pageUrl}, IdealKey: ${idealKey})`);
  return null;
}

/**
 * Generic function to serve an image from S3 storage
 *
 * @param s3Key - S3 key for the image
 * @param logContext - Context for logging
 * @returns Promise resolving to image buffer and content type, or null if not found
 */
export async function serveImageFromS3(
  s3Key: string,
  logContext = 'Image',
): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const buffer = await readBinaryS3(s3Key);
    if (!buffer) {
      if (isDebug) debug(`[${logContext}] serveImageFromS3: readBinaryS3 returned null for key ${s3Key}.`);
      return null;
    }

    // Determine content type from extension
    const extension = s3Key.split('.').pop()?.toLowerCase();
    const contentType =
      extension === 'svg' ? 'image/svg+xml' : `image/${extension || 'png'}`;
    
    if (isDebug) debug(`[${logContext}] Successfully prepared image for serving from S3 key: ${s3Key}, ContentType: ${contentType}`);
    return { buffer, contentType };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[${logContext}] Failed to serve image from S3: ${s3Key}`, errorMessage);
    return null;
  }
}
