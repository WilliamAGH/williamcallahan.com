/**
 * S3 Storage Utility Functions
 *
 * Provides a comprehensive interface for S3 operations including file read/write,
 * JSON handling, metadata access, object listing, and binary file management
 * Implements error handling and retry logic for improved reliability
 *
 * @module lib/s3-utils
 */

import { Readable } from "node:stream";
import { debug, isDebug } from "@/lib/utils/debug"; // Imported isDebug
import { MEMORY_THRESHOLDS } from "@/lib/constants";
import { safeJsonParse, safeJsonStringify, parseJsonFromBuffer } from "@/lib/utils/json-utils";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getMemoryHealthMonitor } from "@/lib/health/memory-health-monitor";
import { getContentTypeFromExtension, isImageContentType } from "@/lib/utils/content-type";

// Environment variables for S3 configuration
const S3_BUCKET = process.env.S3_BUCKET;
const S3_ENDPOINT_URL = process.env.S3_SERVER_URL; // Use S3_SERVER_URL env var for S3 endpoint
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;
const S3_REGION = process.env.S3_REGION || process.env.AWS_REGION || "us-east-1"; // Default region for S3 operations (override with S3_REGION)
const DRY_RUN = process.env.DRY_RUN === "true";
const S3_PUBLIC_CDN_URL = process.env.S3_PUBLIC_CDN_URL ?? process.env.S3_CDN_URL; // Public CDN endpoint (supports S3_PUBLIC_CDN_URL or legacy S3_CDN_URL)

// Constants for S3 read retries
const MAX_S3_READ_RETRIES = 3; // Actually do 3 retry attempts
const S3_READ_RETRY_DELAY_MS = 100; // More reasonable delay of 100ms

// Memory protection constants
const MAX_S3_READ_SIZE = 50 * 1024 * 1024; // 50MB max read size to prevent memory exhaustion
// Memory pressure threshold moved to coordinated detection in isUnderMemoryPressure()

// Request coalescing for duplicate S3 reads
const inFlightReads = new Map<string, Promise<Buffer | string | null>>();

// Utility: determine if an S3 key represents a potentially large binary (image) payload
function isBinaryKey(key: string): boolean {
  // Fast-path: any key stored under images/ directory is binary
  if (key.startsWith("images/")) return true;

  // Otherwise infer from file extension using centralised helpers
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  const contentType = getContentTypeFromExtension(ext);
  return isImageContentType(contentType);
}

if (!S3_BUCKET || !S3_ENDPOINT_URL || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
  console.warn(
    "[S3Utils] Missing one or more S3 configuration environment variables (S3_BUCKET, S3_SERVER_URL, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY). S3 operations may fail.",
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
        // Increase retry attempts for better resilience
        maxAttempts: 5, // Default is 3, increase to 5
        retryMode: "standard", // Use standard retry mode with exponential backoff
      })
    : null;

/**
 * Check if system is under memory pressure
 */
function isUnderMemoryPressure(): boolean {
  const monitor = getMemoryHealthMonitor();
  return !monitor.shouldAcceptNewRequests();
}

/**
 * Check if system has enough memory headroom for S3 operations
 */
function hasMemoryHeadroom(): boolean {
  if (typeof process === "undefined") return true;

  const monitor = getMemoryHealthMonitor();
  if (!monitor.shouldAcceptNewRequests()) return false;

  const { rss, heapUsed, heapTotal } = process.memoryUsage();
  const rssCritical = MEMORY_THRESHOLDS.MEMORY_CRITICAL_THRESHOLD;
  const HEAP_UTIL_THRESHOLD = 0.9;
  const heapUtilisation = heapTotal > 0 ? heapUsed / heapTotal : 0;

  return rss <= rssCritical && heapUtilisation < HEAP_UTIL_THRESHOLD;
}

/**
 * Validate content size before reading to prevent memory exhaustion
 */
async function validateContentSize(key: string): Promise<boolean> {
  if (!s3Client || !S3_BUCKET) return true; // Skip validation if S3 not configured

  try {
    const command = new HeadObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });
    const response = await s3Client.send(command);
    const contentLength = response.ContentLength;

    if (contentLength && contentLength > MAX_S3_READ_SIZE) {
      console.warn(
        `[S3Utils] Object ${key} too large (${contentLength} bytes > ${MAX_S3_READ_SIZE} bytes). Skipping read to prevent memory exhaustion.`,
      );
      return false;
    }

    return true;
  } catch (error) {
    // If we can't get size, allow the read to proceed (might be a permissions issue)
    if (isDebug) debug(`[S3Utils] Could not validate size for ${key}:`, error);
    return true;
  }
}

/**
 * Retrieves an object from S3 by key, optionally using a byte range.
 *
 * Returns the object content as a UTF-8 string for text or JSON types, or as a Buffer for other content types. If the object is not found or an error occurs, returns null.
 *
 * @param key - The S3 object key to read
 * @param options - Optional settings, including a byte range for partial reads
 * @returns The object content as a string or Buffer, or null if not found or on error
 *
 * @remark Retries up to MAX_S3_READ_RETRIES times on transient "not found" errors before returning null
 */
export async function readFromS3(
  key: string,
  options?: { range?: string }, // Add optional options object
): Promise<Buffer | string | null> {
  // Check for in-flight request coalescing (only for non-range requests)
  const cacheKey = options?.range ? `${key}:${options.range}` : key;
  if (!options?.range && inFlightReads.has(cacheKey)) {
    if (isDebug) debug(`[S3Utils] Coalescing duplicate read request for ${key}`);
    const existingPromise = inFlightReads.get(cacheKey);
    if (existingPromise) {
      return existingPromise;
    }
  }

  // Create promise for this read operation with guaranteed cleanup
  const readPromise = performS3Read(key, options).finally(() => {
    // Ensure cleanup even if performS3Read throws synchronously
    if (!options?.range) {
      inFlightReads.delete(cacheKey);
    }
  });

  // Track in-flight request only for non-range requests
  if (!options?.range) {
    inFlightReads.set(cacheKey, readPromise);
  }
  return readPromise;
}

async function performS3Read(key: string, options?: { range?: string }): Promise<Buffer | string | null> {
  if (isUnderMemoryPressure() && isBinaryKey(key)) {
    // Allow small binaries (e.g., logos) under pressure, but block anything exceeding MAX_S3_READ_SIZE.
    const canProceed = await validateContentSize(key);
    if (!canProceed) {
      console.warn(`[S3Utils] System under memory pressure. Deferring binary read of ${key}`);
      return null;
    }
  }

  // Validate content size before reading (skip for range requests)
  if (!options?.range && !(await validateContentSize(key))) {
    return null;
  }

  // Bypass public CDN for JSON files to avoid stale cache; only use CDN for non-JSON
  const isJson = key.endsWith(".json");
  if (!isJson && S3_PUBLIC_CDN_URL) {
    const cdnUrl = `${S3_PUBLIC_CDN_URL.replace(/\/+$/, "")}/${key}`;
    if (isDebug) debug(`[S3Utils] Attempting to read key ${key} via CDN: ${cdnUrl}`);

    // Use AbortController to prevent hanging requests
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 10000); // 10 second timeout

    try {
      const res = await fetch(cdnUrl, {
        signal: abortController.signal,
        headers: {
          "User-Agent": "S3Utils/1.0", // Identify requests
        },
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        // Check content length before reading
        const contentLength = res.headers.get("content-length");
        if (contentLength && parseInt(contentLength, 10) > MAX_S3_READ_SIZE) {
          console.warn(
            `[S3Utils] CDN response too large (${contentLength} bytes > ${MAX_S3_READ_SIZE} bytes). Skipping.`,
          );
          return null;
        }

        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType = res.headers.get("content-type") || "";
        if (isDebug)
          debug(`[S3Utils] Successfully read key ${key} from CDN. ContentType: ${contentType}, Size: ${buffer.length}`);
        if (contentType.startsWith("text/") || contentType.includes("application/json")) {
          return buffer.toString("utf-8");
        }
        return buffer;
      }
      if (isDebug)
        debug(
          `[S3Utils] CDN fetch failed for ${cdnUrl}: ${res.status} ${res.statusText}. Falling back to direct S3 read.`,
        );
    } catch (err) {
      clearTimeout(timeoutId);
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (isDebug) debug(`[S3Utils] CDN fetch error for ${cdnUrl}: ${errorMessage}. Falling back to direct S3 read.`);
    }
    // Fallback to AWS SDK if CDN fetch fails
  }
  if (DRY_RUN) {
    if (isDebug)
      debug(`[S3Utils][DRY RUN] Would read from S3 key ${key}${options?.range ? ` with range ${options.range}` : ""}`);
    return null;
  }
  if (!S3_BUCKET) {
    console.error("[S3Utils] S3_BUCKET is not configured. Cannot read from S3.");
    return null;
  }
  if (!s3Client) {
    console.error("[S3Utils] S3 client is not initialized. Cannot read from S3.");
    return null;
  }

  if (isDebug)
    debug(
      `[S3Utils] Attempting direct S3 read for key: ${key} ${options?.range ? ` with range ${options.range}` : ""}`,
    );
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
        if (isDebug)
          debug(
            `[S3Utils] Successfully read key ${key} directly from S3 (attempt ${attempt}/${MAX_S3_READ_RETRIES}). ContentType: ${ContentType ?? "unknown"}, Size: ${buffer.length}`,
          );
        // If it's likely text, return as string, otherwise as buffer
        if (ContentType?.startsWith("text/") || ContentType === "application/json") {
          return buffer.toString("utf-8");
        }
        return buffer;
      }
      if (isDebug)
        debug(
          `[S3Utils] Direct S3 read for key ${key} (attempt ${attempt}/${MAX_S3_READ_RETRIES}): Body was not a Readable stream.`,
        );
      return null; // Should not happen if Body is present and Readable
    } catch (error: unknown) {
      const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (err.name === "NotFound" || err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
        if (isDebug) debug(`[S3Utils] readFromS3: Key ${key} not found (attempt ${attempt}/${MAX_S3_READ_RETRIES}).`);
        if (attempt < MAX_S3_READ_RETRIES) {
          if (isDebug) debug(`[S3Utils] Retrying read for ${key} in ${S3_READ_RETRY_DELAY_MS}ms...`);
          await new Promise((resolve) => setTimeout(resolve, S3_READ_RETRY_DELAY_MS));
          continue; // Next attempt
        }
        if (isDebug)
          debug(`[S3Utils] readFromS3: All ${MAX_S3_READ_RETRIES} attempts failed for key ${key}. Returning null.`);
        return null; // All retries failed
      }
      const message = err instanceof Error ? err.message : safeJsonStringify(err) || "Unknown error";
      console.error(`[S3Utils] Error reading from S3 key ${key} (attempt ${attempt}/${MAX_S3_READ_RETRIES}):`, message);
      return null;
    }
  }
  return null;
}

/**
 * Writes an object to S3.
 * @param key The S3 object key
 * @param data The data to write (string or Buffer)
 * @param contentType The MIME type of the content
 * @param acl The access control list permission (defaults to private for security)
 */
export async function writeToS3(
  key: string,
  data: Buffer | string | Readable,
  contentType?: string,
  acl: "private" | "public-read" | "public-read-write" | "authenticated-read" = "private",
): Promise<void> {
  const SMALL_PAYLOAD_THRESHOLD = 512 * 1024; // 512 KB
  const dataSize =
    typeof data === "string"
      ? Buffer.byteLength(data, "utf-8")
      : Buffer.isBuffer(data)
        ? data.length
        : SMALL_PAYLOAD_THRESHOLD; // Unknown stream size – treat as small for head-room check

  if (isBinaryKey(key)) {
    // For binary payloads, only block when (a) the process is under
    // memory pressure *and* (b) the payload is larger than the
    // conservative SMALL_PAYLOAD_THRESHOLD (512&nbsp;KB). This prevents
    // harmless favicon-sized writes (usually <10&nbsp;KB) from failing
    // when the process is close to the RSS limit while still protecting
    // against large image uploads that could exacerbate memory issues.

    if (dataSize > SMALL_PAYLOAD_THRESHOLD && !hasMemoryHeadroom()) {
      throw new Error(
        `[S3Utils] Insufficient memory headroom for binary S3 write operation (>${SMALL_PAYLOAD_THRESHOLD} bytes)`,
      );
    }
  } else if (!hasMemoryHeadroom() && dataSize > SMALL_PAYLOAD_THRESHOLD) {
    // For non-binary (JSON/string) data, still guard very large writes
    throw new Error(`[S3Utils] Insufficient memory headroom for large S3 write operation`);
  }

  if (DRY_RUN) {
    if (isDebug)
      debug(
        `[S3Utils][DRY RUN] Would write to S3 key ${key}. ContentType: ${contentType ?? "unknown"}, ACL: ${acl}, Data size: ${
          typeof data === "string" ? dataSize : Buffer.isBuffer(data) ? data.length : "stream"
        }`,
      );
    return;
  }
  if (!S3_BUCKET) {
    console.error("[S3Utils] S3_BUCKET is not configured. Cannot write to S3.");
    return;
  }
  if (!s3Client) {
    console.error("[S3Utils] S3 client is not initialized. Cannot write to S3.");
    return;
  }
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: data,
    ContentType: contentType,
    ACL: acl,
  });

  try {
    if (isDebug)
      debug(
        `[S3Utils] Attempting to write to S3 key ${key}. ContentType: ${contentType ?? "unknown"}, Data size: ${
          typeof data === "string" ? dataSize : Buffer.isBuffer(data) ? data.length : "stream"
        }`,
      );
    await s3Client.send(command);
    if (isDebug) debug(`[S3Utils] Successfully wrote to S3 key ${key}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : safeJsonStringify(error) || "Unknown error";
    console.error(`[S3Utils] Error writing to S3 key ${key}:`, message);
    // Re-throw the error so callers like writeBinaryS3 can catch it if needed
    throw error;
  }
}

/**
 * Checks if an object exists in S3.
 * @param key The S3 object key
 * @returns True if the object exists, false otherwise
 */
export async function checkIfS3ObjectExists(key: string): Promise<boolean> {
  if (DRY_RUN) {
    if (isDebug) debug(`[S3Utils][DRY RUN] Would check existence of S3 key ${key}`);
    return false;
  }
  if (!S3_BUCKET) {
    console.error("[S3Utils] S3_BUCKET is not configured. Cannot check S3 object existence.");
    return false;
  }
  if (!s3Client) {
    console.error("[S3Utils] S3 client is not initialized. Cannot check S3 object existence.");
    return false;
  }
  const command = new HeadObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });

  try {
    if (isDebug) debug(`[S3Utils] Checking existence of S3 key: ${key}`);
    await s3Client.send(command);
    if (isDebug) debug(`[S3Utils] S3 key ${key} exists.`);
    return true;
  } catch (error: unknown) {
    const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err.name === "NotFound" || err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
      if (isDebug) debug(`[S3Utils] S3 key ${key} does not exist (NotFound).`);
      return false;
    }
    const message = err instanceof Error ? err.message : safeJsonStringify(err) || "Unknown error";
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
  if (DRY_RUN) {
    if (isDebug) debug(`[S3Utils][DRY RUN] Would get metadata for S3 key ${key}`);
    return null;
  }
  if (!S3_BUCKET) {
    console.error("[S3Utils] S3_BUCKET is not configured. Cannot get S3 object metadata.");
    return null;
  }
  if (!s3Client) {
    console.error("[S3Utils] S3 client is not initialized. Cannot get S3 object metadata.");
    return null;
  }
  const command = new HeadObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });

  try {
    if (isDebug) debug(`[S3Utils] Getting metadata for S3 key: ${key}`);
    const response = await s3Client.send(command);
    if (isDebug)
      debug(
        `[S3Utils] Successfully got metadata for S3 key ${key}. ETag: ${response.ETag ?? "undefined"}, LastModified: ${response.LastModified ? response.LastModified.toISOString() : "undefined"}`,
      );
    return {
      ETag: response.ETag,
      LastModified: response.LastModified,
    };
  } catch (error: unknown) {
    const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err.name === "NotFound" || err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
      if (isDebug) debug(`[S3Utils] Metadata not found for S3 key ${key} (NotFound).`);
      return null;
    }
    const message = err instanceof Error ? err.message : safeJsonStringify(err) || "Unknown error";
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
  if (DRY_RUN) {
    if (isDebug) debug(`[S3Utils][DRY RUN] Would list S3 objects with prefix ${prefix}`);
    return [];
  }
  if (!S3_BUCKET) {
    console.error("[S3Utils] S3_BUCKET is not configured. Cannot list S3 objects.");
    return [];
  }
  if (!s3Client) {
    console.error("[S3Utils] S3 client is not initialized. Cannot list S3 objects.");
    return [];
  }
  const keys: string[] = [];
  let continuationToken: string | undefined;

  try {
    if (isDebug) debug(`[S3Utils] Listing S3 objects with prefix: ${prefix}`);
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
    if (isDebug) debug(`[S3Utils] Found ${keys.length} S3 objects with prefix ${prefix}.`);
    return keys;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : safeJsonStringify(error) || "Unknown error";
    console.error(`[S3Utils] Error listing S3 objects with prefix ${prefix}:`, message);
    return [];
  }
}

/**
 * Deletes an object from S3.
 * @param key The S3 object key to delete
 */
export async function deleteFromS3(key: string): Promise<void> {
  if (DRY_RUN) {
    if (isDebug) debug(`[S3Utils][DRY RUN] Would delete S3 object: ${key}`);
    return;
  }
  if (!S3_BUCKET) {
    console.error("[S3Utils] S3_BUCKET is not configured. Cannot delete from S3.");
    return;
  }
  if (!s3Client) {
    console.error("[S3Utils] S3 client is not initialized. Cannot delete from S3.");
    return;
  }
  const command = new DeleteObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });

  try {
    if (isDebug) debug(`[S3Utils] Attempting to delete S3 object: ${key}`);
    await s3Client.send(command);
    if (isDebug) debug(`[S3Utils] Successfully deleted S3 object: ${key}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : safeJsonStringify(error) || "Unknown error";
    console.error(`[S3Utils] Error deleting S3 object ${key}:`, message);
  }
}

// Helper to convert stream to buffer with size limit protection
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    let timeoutId: NodeJS.Timeout | undefined;

    // Set timeout to prevent hanging streams
    const STREAM_TIMEOUT_MS = 30000; // 30 seconds
    timeoutId = setTimeout(() => {
      stream.destroy();
      // Clear accumulated chunks to prevent memory retention
      chunks.length = 0;
      reject(new Error("Stream timeout: took longer than 30 seconds"));
    }, STREAM_TIMEOUT_MS);

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };

    stream.on("data", (chunk: Buffer) => {
      totalSize += chunk.length;

      // Prevent memory exhaustion
      if (totalSize > MAX_S3_READ_SIZE) {
        cleanup();
        stream.destroy();
        // Clear accumulated chunks to prevent memory retention
        chunks.length = 0;
        reject(new Error(`Stream too large: ${totalSize} bytes exceeds ${MAX_S3_READ_SIZE} bytes`));
        return;
      }

      chunks.push(chunk);
    });

    stream.on("error", (error) => {
      cleanup();
      reject(error);
    });

    stream.on("end", () => {
      cleanup();
      resolve(Buffer.concat(chunks));
    });

    // Handle stream destruction
    stream.on("close", () => {
      cleanup();
    });
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
    if (isDebug) debug(`[S3Utils][DRY RUN] Would read JSON from S3 key ${s3Key}`);
    return null;
  }
  try {
    const content = await readFromS3(s3Key); // readFromS3 already has debug logging
    if (typeof content === "string") {
      const parsed = safeJsonParse<T>(content);
      if (parsed !== null && isDebug) debug(`[S3Utils] Successfully read and parsed JSON from S3 key ${s3Key}.`);
      return parsed;
    }
    if (Buffer.isBuffer(content)) {
      const parsed = parseJsonFromBuffer<T>(content, "utf-8");
      if (parsed !== null && isDebug)
        debug(`[S3Utils] Successfully read and parsed JSON (from buffer) from S3 key ${s3Key}.`);
      return parsed;
    }
    if (isDebug) debug(`[S3Utils] readJsonS3: Key ${s3Key} not found or content was not string/buffer.`);
    return null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : safeJsonStringify(error) || "Unknown error";
    console.warn(`[S3Utils] Error reading/parsing JSON from S3 key ${s3Key}:`, message);
    return null;
  }
}

/**
 * Writes data to an S3 JSON object with optional conditional write support
 * @param s3Key S3 object key
 * @param data Data to write
 * @param options Optional parameters including IfNoneMatch for conditional writes
 */
export async function writeJsonS3<T>(s3Key: string, data: T, options?: { IfNoneMatch?: string }): Promise<void> {
  if (DRY_RUN) {
    if (isDebug) debug(`[S3Utils][DRY RUN] Would write JSON to S3 key: ${s3Key}`);
    return;
  }

  // Add memory check before JSON stringify
  const jsonData = safeJsonStringify(data, 2);
  if (!jsonData) {
    throw new Error("Failed to stringify JSON data");
  }

  const dataSize = Buffer.byteLength(jsonData, "utf-8");
  const SMALL_PAYLOAD_THRESHOLD = 512 * 1024; // 512 KB

  if (!hasMemoryHeadroom() && dataSize > SMALL_PAYLOAD_THRESHOLD) {
    console.warn(
      `[S3Utils] Skipping S3 write for ${s3Key} (${(dataSize / 1024).toFixed(1)} KB) due to memory pressure`,
    );
    return;
  }

  try {
    // If conditional write options are provided, use direct S3 command
    if (options?.IfNoneMatch) {
      if (!S3_BUCKET || !s3Client) {
        throw new Error("[S3Utils] S3 not properly configured for conditional write");
      }

      const command = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
        Body: jsonData,
        ContentType: "application/json",
        ACL: "public-read", // JSON data is typically public
      });

      await s3Client.send(command);
      if (isDebug) debug(`[S3Utils] Conditional write successful for ${s3Key}`);
    } else {
      // Use regular writeToS3 for non-conditional writes
      await writeToS3(s3Key, jsonData, "application/json", "public-read");
    }
    // No need for redundant success log here, writeToS3 handles it.
  } catch (_error: unknown) {
    // If error is due to conditional write failing because object exists (HTTP 412), treat as benign
    const err = _error as { name?: string; $metadata?: { httpStatusCode?: number } };
    const isPreconditionFailed = err.name === "PreconditionFailed" || err.$metadata?.httpStatusCode === 412;

    const message = _error instanceof Error ? _error.message : safeJsonStringify(_error) || "Unknown error";

    if (isPreconditionFailed) {
      // Only log at debug level to keep dev console clean
      if (isDebug) debug(`[S3Utils] Conditional write skipped for ${s3Key} (object already exists, HTTP 412).`);
      return; // Swallow error – lock already exists
    }

    console.error(`[S3Utils] Failed to write JSON to S3 key ${s3Key}:`, message);
    throw _error; // Re-throw other errors so callers can handle
  }
}

/**
 * Reads a binary file (e.g., an image) from S3
 * @param s3Key S3 object key
 * @returns Buffer or null
 */
export async function readBinaryS3(s3Key: string): Promise<Buffer | null> {
  if (DRY_RUN) {
    if (isDebug) debug(`[S3Utils][DRY RUN] Would read binary from S3 key ${s3Key}`);
    return null;
  }
  try {
    const content = await readFromS3(s3Key); // readFromS3 has debug logging
    if (Buffer.isBuffer(content)) {
      // Success already logged by readFromS3 if direct S3 read occurred.
      // If from CDN, readFromS3 also logs success.
      return content;
    }
    if (typeof content === "string") {
      // Handle text content (like CSV files) that should be treated as binary
      return Buffer.from(content, "utf-8");
    }
    if (isDebug) debug(`[S3Utils] readBinaryS3: Key ${s3Key} not found or content was not a buffer.`);
    return null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : safeJsonStringify(error) || "Unknown error";
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
export async function writeBinaryS3(s3Key: string, data: Buffer | Readable, contentType: string): Promise<void> {
  if (DRY_RUN) {
    if (isDebug)
      debug(
        `[S3Utils][DRY RUN] Would write binary file to S3 key: ${s3Key}. ContentType: ${contentType}, Size: ${
          Buffer.isBuffer(data) ? data.length : "stream"
        }`,
      );
    return;
  }

  try {
    // writeToS3 handles the actual S3 put and its specific debug logging
    // Binary files (images, etc.) are typically public for CDN serving
    await writeToS3(s3Key, data, contentType, "public-read");
    // Success is logged by writeToS3.
  } catch (_error: unknown) {
    const message = _error instanceof Error ? _error.message : safeJsonStringify(_error) || "Unknown error";
    console.error(`[S3Utils] Failed to write binary file to S3 key ${s3Key}:`, message);
    throw _error; // Re-throw to let callers handle the error appropriately
  }
}
