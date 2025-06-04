/**
 * S3 Storage Utility Functions
 *
 * Provides comprehensive interface for S3 operations including file read/write,
 * JSON handling, metadata access, object listing, and binary file management
 * Implements error handling and retry logic for improved reliability
 *
 * @module lib/s3-utils
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';

// Environment variables for S3 configuration
const S3_BUCKET = process.env.S3_BUCKET;
const S3_ENDPOINT_URL = process.env.S3_SERVER_URL; // Use S3_SERVER_URL env var for S3 endpoint
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;
const S3_REGION = process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1'; // Default region for S3 operations (override with S3_REGION)
const VERBOSE = process.env.VERBOSE === 'true' || false; // Added for logging consistency
const DRY_RUN = process.env.DRY_RUN === 'true';
const S3_PUBLIC_CDN_URL = process.env.S3_PUBLIC_CDN_URL ?? process.env.S3_CDN_URL; // Public CDN endpoint (supports S3_PUBLIC_CDN_URL or legacy S3_CDN_URL)

// Constants for S3 read retries
const MAX_S3_READ_RETRIES = 1;
const S3_READ_RETRY_DELAY_MS = 10;

if (!S3_BUCKET || !S3_ENDPOINT_URL || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
  console.warn(
    '[S3Utils] Missing one or more S3 configuration environment variables (S3_BUCKET, S3_SERVER_URL, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY). S3 operations may fail.'
  );
}

export const s3Client: S3Client | null =
  S3_BUCKET && S3_ENDPOINT_URL && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY
    ? new S3Client({
        endpoint: S3_ENDPOINT_URL,
        region: S3_REGION,
        credentials: {
          accessKeyId: S3_ACCESS_KEY_ID,
          secretAccessKey: S3_SECRET_ACCESS_KEY,
        },
        forcePathStyle: true,
      })
    : null;

/**
 * Retrieves an object from S3 by key, optionally using a byte range.
 *
 * Returns the object content as a UTF-8 string for text or JSON types, or as a Buffer for other content types. If the object is not found or an error occurs, returns null.
 *
 * @param key - The S3 object key to read
 * @param options - Optional settings, including a byte range for partial reads
 * @returns The object content as a string or Buffer, or null if not found or on error
 *
 * @remark Retries up to three times on transient "not found" errors before returning null
 */
export async function readFromS3(
  key: string,
  options?: { range?: string } // Add optional options object
): Promise<Buffer | string | null> {
  // If a public CDN URL is set, try fetching from it first
  if (S3_PUBLIC_CDN_URL) {
    const cdnUrl = `${S3_PUBLIC_CDN_URL.replace(/\/+$/, '')}/${key}`;
    try {
      const res = await fetch(cdnUrl);
      if (res.ok) {
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType = res.headers.get('content-type') || '';
        if (contentType.startsWith('text/') || contentType.includes('application/json')) {
          return buffer.toString('utf-8');
        }
        return buffer;
      }
      if (VERBOSE) console.warn(`[S3Utils] CDN fetch failed for ${cdnUrl}: ${res.status} ${res.statusText}`);
    } catch (err) {
      if (VERBOSE) console.error(`[S3Utils] CDN fetch error for ${cdnUrl}:`, JSON.stringify(err));
    }
    // Fallback to AWS SDK if CDN fetch fails
  }
  if (DRY_RUN) {
    if (VERBOSE) console.log(`[S3Utils][DRY RUN] Would read from S3 key ${key}${options?.range ? ` with range ${options.range}` : ''}`);
    return null;
  }
  if (!S3_BUCKET) {
    console.error('[S3Utils] S3_BUCKET is not configured. Cannot read from S3.');
    return null;
  }
  if (!s3Client) {
    console.error('[S3Utils] S3 client is not initialized. Cannot read from S3.');
    return null;
  }

  for (let attempt = 1; attempt <= MAX_S3_READ_RETRIES; attempt++) {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Range: options?.range, // Pass range option if provided
    });

    try {
      const { Body, ContentType } = await s3Client.send(command);
      if (Body instanceof Readable) {
        const buffer = await streamToBuffer(Body);
        // If it's likely text, return as string, otherwise as buffer
        if (ContentType?.startsWith('text/') || ContentType === 'application/json') {
          return buffer.toString('utf-8');
        }
        return buffer;
      }
      return null; // Should not happen if Body is present and Readable
    } catch (error: unknown) {
      const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (err.name === 'NotFound' || err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        if (VERBOSE) {
          console.log(`[S3Utils] readFromS3: Key ${key} not found (attempt ${attempt}/${MAX_S3_READ_RETRIES}).`);
        }
        if (attempt < MAX_S3_READ_RETRIES) {
          if (VERBOSE) console.log(`[S3Utils] Retrying read for ${key} in ${S3_READ_RETRY_DELAY_MS}ms...`);
          await new Promise(resolve => setTimeout(resolve, S3_READ_RETRY_DELAY_MS));
          continue; // Next attempt
        }
        if (VERBOSE) console.log(`[S3Utils] readFromS3: All ${MAX_S3_READ_RETRIES} attempts failed for key ${key}. Returning null.`);
        return null; // All retries failed
      }
      const message = err instanceof Error ? err.message : JSON.stringify(err);
      console.error(`[S3Utils] Error reading from S3 key ${key} (attempt ${attempt}/${MAX_S3_READ_RETRIES}):`, message);
      // For non-NotFound errors, typically don't retry unless specifically designed for transient network issues
      // For simplicity here, we'll let it fall through and return null after the loop if it was the last attempt,
      // or if another error type broke the loop (which it won't with current structure, this catch only handles last attempt or non-retryable errors)
      return null; // Return null on other errors or if loop finishes
    }
  }
  return null; // Fallback, though loop should handle all paths
}

/**
 * Writes an object to S3.
 * @param key The S3 object key
 * @param data The data to write (string or Buffer)
 * @param contentType The MIME type of the content
 */
export async function writeToS3(key: string, data: Buffer | string, contentType?: string): Promise<void> {
  if (!S3_BUCKET) {
    console.error('[S3Utils] S3_BUCKET is not configured. Cannot write to S3.');
    return;
  }
  if (!s3Client) {
    console.error('[S3Utils] S3 client is not initialized. Cannot write to S3.');
    return;
  }
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: data,
    ContentType: contentType,
    // Ensure uploaded objects are publicly readable
    ACL: 'public-read',
  });

  try {
    await s3Client.send(command);
    // console.log(`[S3Utils] Successfully wrote to S3 key ${key}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    console.error(`[S3Utils] Error writing to S3 key ${key}:`, message);
  }
}

/**
 * Checks if an object exists in S3.
 * @param key The S3 object key
 * @returns True if the object exists, false otherwise
 */
export async function checkIfS3ObjectExists(key: string): Promise<boolean> {
  if (!S3_BUCKET) {
    console.error('[S3Utils] S3_BUCKET is not configured. Cannot check S3 object existence.');
    return false;
  }
  if (!s3Client) {
    console.error('[S3Utils] S3 client is not initialized. Cannot check S3 object existence.');
    return false;
  }
  const command = new HeadObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });

  try {
    await s3Client.send(command);
    return true;
  } catch (error: unknown) {
    const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err.name === 'NotFound' || err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    console.error(`[S3Utils] Error checking S3 object existence for key ${key}:`, message);
    return false;
  }
}

/**
 * Retrieves metadata for an S3 object
 * @param key The S3 object key
 * @returns Object metadata (ETag, LastModified) or null if not found or error
 */
export async function getS3ObjectMetadata(key: string): Promise<{ ETag?: string; LastModified?: Date } | null> {
  if (!S3_BUCKET) {
    console.error('[S3Utils] S3_BUCKET is not configured. Cannot get S3 object metadata.');
    return null;
  }
  if (!s3Client) {
    console.error('[S3Utils] S3 client is not initialized. Cannot get S3 object metadata.');
    return null;
  }
  const command = new HeadObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });

  try {
    const response = await s3Client.send(command);
    return {
      ETag: response.ETag,
      LastModified: response.LastModified,
    };
  } catch (error: unknown) {
    const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err.name === 'NotFound' || err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    console.error(`[S3Utils] Error getting S3 object metadata for key ${key}:`, message);
    return null;
  }
}

/**
 * Lists objects in S3 under a given prefix.
 * @param prefix The prefix to filter objects by
 * @returns An array of object keys, or an empty array if error or no objects
 */
export async function listS3Objects(prefix: string): Promise<string[]> {
  if (!S3_BUCKET) {
    console.error('[S3Utils] S3_BUCKET is not configured. Cannot list S3 objects.');
    return [];
  }
  if (!s3Client) {
    console.error('[S3Utils] S3 client is not initialized. Cannot list S3 objects.');
    return [];
  }
  const keys: string[] = [];
  let continuationToken: string | undefined;

  try {
    do {
      const command = new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });
      const response = await s3Client.send(command);
      if (response.Contents) {
        for (const item of response.Contents) {
          if (item.Key) {
            keys.push(item.Key);
          }
        }
      }
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
    return keys;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    console.error(`[S3Utils] Error listing S3 objects with prefix ${prefix}:`, message);
    return [];
  }
}

/**
 * Deletes an object from S3.
 * @param key The S3 object key to delete
 */
export async function deleteFromS3(key: string): Promise<void> {
  if (!S3_BUCKET) {
    console.error('[S3Utils] S3_BUCKET is not configured. Cannot delete from S3.');
    return;
  }
  if (!s3Client) {
    console.error('[S3Utils] S3 client is not initialized. Cannot delete from S3.');
    return;
  }
  const command = new DeleteObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });

  try {
    await s3Client.send(command);
    // console.log(`[S3Utils] Successfully deleted S3 object: ${key}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    console.error(`[S3Utils] Error deleting S3 object ${key}:`, message);
  }
}

// Helper to convert stream to buffer, as AWS SDK v3 GetObjectCommand Body is a Readable
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', chunk => chunks.push(chunk as Buffer));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// --- NEW JSON Helpers ---

/**
 * Reads data from an S3 JSON object
 * @param s3Key S3 object key
 * @returns Parsed JSON data or null if an error occurs
 */
export async function readJsonS3<T>(s3Key: string): Promise<T | null> {
  if (DRY_RUN) {
    if (VERBOSE) console.log(`[S3Utils][DRY RUN] Would read JSON from S3 key ${s3Key}`);
    return null;
  }
  try {
    const content = await readFromS3(s3Key);
    if (typeof content === 'string') {
      return JSON.parse(content) as T;
    }
    if (Buffer.isBuffer(content)) {
      return JSON.parse(content.toString('utf-8')) as T;
    }
    if (VERBOSE && content === null) console.log(`[S3Utils] readJsonS3: Key ${s3Key} not found or empty.`);
    return null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    console.warn(`[S3Utils] Error reading/parsing JSON from S3 key ${s3Key}:`, message);
    return null;
  }
}

/**
 * Writes data to an S3 JSON object
 * @param s3Key S3 object key
 * @param data Data to write
 */
export async function writeJsonS3<T>(s3Key: string, data: T): Promise<void> {
  // Check for DRY_RUN environment variable
  if (process.env.DRY_RUN === 'true') {
    console.log(`[S3Utils][DRY RUN] Would write JSON to S3 bucket '${S3_BUCKET}', path: ${s3Key}`);
    // Optionally log a snippet of the data for verification, being mindful of size/sensitivity
    // console.log(`[S3Utils][DRY RUN] Data snippet: ${JSON.stringify(data).substring(0, 100)}...`);
    return; // Skip actual S3 write
  }

  try {
    const jsonData = JSON.stringify(data, null, 2);
    await writeToS3(s3Key, jsonData, 'application/json');
    if (VERBOSE) console.log(`[S3Utils] Successfully wrote JSON to S3 key ${s3Key}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    console.error(`[S3Utils] Failed to write JSON to S3 key ${s3Key}:`, message);
  }
}

/**
 * Reads a binary file (e.g., an image) from S3
 * @param s3Key S3 object key
 * @returns Buffer or null
 */
export async function readBinaryS3(s3Key: string): Promise<Buffer | null> {
  if (DRY_RUN) {
    if (VERBOSE) console.log(`[S3Utils][DRY RUN] Would read binary from S3 key ${s3Key}`);
    return null;
  }
  try {
    const content = await readFromS3(s3Key);
    if (Buffer.isBuffer(content)) {
      return content;
    }
    if (VERBOSE && content === null) console.log(`[S3Utils] readBinaryS3: Key ${s3Key} not found or not a buffer.`);
    return null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    console.warn(`[S3Utils] Error reading binary file from S3 key ${s3Key}:`, message);
    return null;
  }
}

/**
 * Writes a binary file (e.g., an image) to S3.
 * @param s3Key S3 object key
 * @param data Buffer to write
 * @param contentType MIME type of the content
 */
export async function writeBinaryS3(s3Key: string, data: Buffer, contentType: string): Promise<void> {
  // Check for DRY_RUN environment variable
  if (process.env.DRY_RUN === 'true') {
    console.log(`[S3Utils][DRY RUN] Would write binary file (${contentType}, size: ${data.length} bytes) to S3 bucket '${S3_BUCKET}', path: ${s3Key}`);
    return; // Skip actual S3 write
  }

  try {
    await writeToS3(s3Key, data, contentType);
    if (VERBOSE) console.log(`[S3Utils] Successfully wrote binary file to S3 key ${s3Key}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    console.error(`[S3Utils] Failed to write binary file to S3 key ${s3Key}:`, message);
  }
}
