/**
 * @fileoverview
 * This file contains utility functions for interacting with S3
 * It provides functions to read, write, check existence, get metadata, list, and delete objects in S3
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';

// Environment variables for S3 configuration
const S3_BUCKET_NAME = process.env.S3_BUCKET;
const S3_ENDPOINT_URL = process.env.S3_SERVER_URL; // For S3-compatible services like DigitalOcean Spaces
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;
const S3_REGION = process.env.AWS_REGION || 'us-east-1'; // Default region, can be overridden by env
const VERBOSE = process.env.VERBOSE === 'true' || false; // Added for logging consistency
const DRY_RUN = process.env.DRY_RUN === 'true';

if (!S3_BUCKET_NAME || !S3_ENDPOINT_URL || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
  console.warn(
    '[S3Utils] Missing one or more S3 configuration environment variables (S3_BUCKET, S3_SERVER_URL, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY). S3 operations may fail.'
  );
}

export const s3Client: S3Client | null =
  S3_BUCKET_NAME && S3_ENDPOINT_URL && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY
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
 * Reads an object from S3.
 * @param key The S3 object key.
 * @returns The object content as a string or Buffer, or null if not found or error.
 */
export async function readFromS3(
  key: string,
  options?: { range?: string } // Add optional options object
): Promise<Buffer | string | null> {
  if (DRY_RUN) {
    if (VERBOSE) console.log(`[S3Utils][DRY RUN] Would read from S3 key ${key}${options?.range ? ' with range ' + options.range : ''}`);
    return null;
  }
  if (!S3_BUCKET_NAME) {
    console.error('[S3Utils] S3_BUCKET_NAME is not configured. Cannot read from S3.');
    return null;
  }
  if (!s3Client) {
    console.error('[S3Utils] S3 client is not initialized. Cannot read from S3.');
    return null;
  }
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET_NAME,
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
    return null;
  } catch (error: unknown) {
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
    const err = error as any;
    if (err.name === 'NotFound' || err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[S3Utils] Error reading from S3 key ${key}:`, message);
    return null;
  }
}

/**
 * Writes an object to S3.
 * @param key The S3 object key.
 * @param data The data to write (string or Buffer).
 * @param contentType The MIME type of the content.
 */
export async function writeToS3(key: string, data: Buffer | string, contentType?: string): Promise<void> {
  if (!S3_BUCKET_NAME) {
    console.error('[S3Utils] S3_BUCKET_NAME is not configured. Cannot write to S3.');
    return;
  }
  if (!s3Client) {
    console.error('[S3Utils] S3 client is not initialized. Cannot write to S3.');
    return;
  }
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET_NAME,
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
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[S3Utils] Error writing to S3 key ${key}:`, message);
  }
}

/**
 * Checks if an object exists in S3.
 * @param key The S3 object key.
 * @returns True if the object exists, false otherwise.
 */
export async function checkIfS3ObjectExists(key: string): Promise<boolean> {
  if (!S3_BUCKET_NAME) {
    console.error('[S3Utils] S3_BUCKET_NAME is not configured. Cannot check S3 object existence.');
    return false;
  }
  if (!s3Client) {
    console.error('[S3Utils] S3 client is not initialized. Cannot check S3 object existence.');
    return false;
  }
  const command = new HeadObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
  });

  try {
    await s3Client.send(command);
    return true;
  } catch (error: unknown) {
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
    const err = error as any;
    if (err.name === 'NotFound' || err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[S3Utils] Error checking S3 object existence for key ${key}:`, message);
    return false;
  }
}

/**
 * Retrieves metadata for an S3 object.
 * @param key The S3 object key.
 * @returns Object metadata (ETag, LastModified) or null if not found or error.
 */
export async function getS3ObjectMetadata(key: string): Promise<{ ETag?: string; LastModified?: Date } | null> {
  if (!S3_BUCKET_NAME) {
    console.error('[S3Utils] S3_BUCKET_NAME is not configured. Cannot get S3 object metadata.');
    return null;
  }
  if (!s3Client) {
    console.error('[S3Utils] S3 client is not initialized. Cannot get S3 object metadata.');
    return null;
  }
  const command = new HeadObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
  });

  try {
    const response = await s3Client.send(command);
    return {
      ETag: response.ETag,
      LastModified: response.LastModified,
    };
  } catch (error: unknown) {
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
    const err = error as any;
    if (err.name === 'NotFound' || err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[S3Utils] Error getting S3 object metadata for key ${key}:`, message);
    return null;
  }
}

/**
 * Lists objects in S3 under a given prefix.
 * @param prefix The prefix to filter objects by.
 * @returns An array of object keys, or an empty array if error or no objects.
 */
export async function listS3Objects(prefix: string): Promise<string[]> {
  if (!S3_BUCKET_NAME) {
    console.error('[S3Utils] S3_BUCKET_NAME is not configured. Cannot list S3 objects.');
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
        Bucket: S3_BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });
      const response = await s3Client.send(command);
      if (response.Contents) {
        response.Contents.forEach(item => {
          if (item.Key) {
            keys.push(item.Key);
          }
        });
      }
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
    return keys;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[S3Utils] Error listing S3 objects with prefix ${prefix}:`, message);
    return [];
  }
}

/**
 * Deletes an object from S3.
 * @param key The S3 object key to delete.
 */
export async function deleteFromS3(key: string): Promise<void> {
  if (!S3_BUCKET_NAME) {
    console.error('[S3Utils] S3_BUCKET_NAME is not configured. Cannot delete from S3.');
    return;
  }
  if (!s3Client) {
    console.error('[S3Utils] S3 client is not initialized. Cannot delete from S3.');
    return;
  }
  const command = new DeleteObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
  });

  try {
    await s3Client.send(command);
    // console.log(`[S3Utils] Successfully deleted S3 object: ${key}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
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
    } else if (Buffer.isBuffer(content)) {
      return JSON.parse(content.toString('utf-8')) as T;
    }
    if (VERBOSE && content === null) console.log(`[S3Utils] readJsonS3: Key ${s3Key} not found or empty.`);
    return null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
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
    console.log(`[S3Utils][DRY RUN] Would write JSON to S3 bucket '${S3_BUCKET_NAME}', path: ${s3Key}`);
    // Optionally log a snippet of the data for verification, being mindful of size/sensitivity
    // console.log(`[S3Utils][DRY RUN] Data snippet: ${JSON.stringify(data).substring(0, 100)}...`);
    return; // Skip actual S3 write
  }

  try {
    const jsonData = JSON.stringify(data, null, 2);
    await writeToS3(s3Key, jsonData, 'application/json');
    if (VERBOSE) console.log(`[S3Utils] Successfully wrote JSON to S3 key ${s3Key}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
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
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[S3Utils] Error reading binary file from S3 key ${s3Key}:`, message);
    return null;
  }
}

/**
 * Writes a binary file (e.g., an image) to S3.
 * @param s3Key S3 object key.
 * @param data Buffer to write.
 * @param contentType MIME type of the content.
 */
export async function writeBinaryS3(s3Key: string, data: Buffer, contentType: string): Promise<void> {
  // Check for DRY_RUN environment variable
  if (process.env.DRY_RUN === 'true') {
    console.log(`[S3Utils][DRY RUN] Would write binary file (${contentType}, size: ${data.length} bytes) to S3 bucket '${S3_BUCKET_NAME}', path: ${s3Key}`);
    return; // Skip actual S3 write
  }

  try {
    await writeToS3(s3Key, data, contentType);
    if (VERBOSE) console.log(`[S3Utils] Successfully wrote binary file to S3 key ${s3Key}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[S3Utils] Failed to write binary file to S3 key ${s3Key}:`, message);
  }
}
