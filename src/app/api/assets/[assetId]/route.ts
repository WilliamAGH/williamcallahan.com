/**
 * Asset Proxy API Route with S3 Write-Through Cache
 *
 * Proxies asset requests to the external bookmarks service (Karakeep/Hoarder)
 * and caches OpenGraph images in S3 with proper file extensions for improved performance.
 *
 * @module api/assets
 *
 * Security measures:
 * - URL validation to prevent injection attacks
 * - Size limits (50MB) to prevent memory exhaustion
 * - Content-type validation for images only
 *
 * Caching strategy:
 * - Check S3 for existing asset (with descriptive filename if context provided)
 * - Fetch from Karakeep if not in S3
 * - Save to S3 in background for future requests
 *
 * @see {@link findAssetInS3} for S3 lookup logic
 * @see {@link saveAssetToS3} for S3 persistence logic
 */

import { type NextRequest, NextResponse } from "next/server";
import { HeadObjectCommand, GetObjectCommand, type GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { s3Client } from "@/lib/s3-utils";
import { getExtensionFromContentType, IMAGE_EXTENSIONS } from "@/lib/utils/content-type";
import { IMAGE_S3_PATHS } from "@/lib/constants";
import { assetIdSchema } from "@/types/schemas/url";
import { IMAGE_SECURITY_HEADERS } from "@/lib/validators/url";
import { stripWwwPrefix } from "@/lib/utils/url-utils";

const MAX_ASSET_SIZE_BYTES = 50 * 1024 * 1024; // 50MB limit
const ASSET_STREAM_TIMEOUT_MS = 20_000; // 20 seconds

/**
 * In-memory set to track ongoing S3 write operations.
 * Prevents duplicate concurrent writes for the same asset.
 * Keys are S3 object keys, automatically cleaned up after write completes.
 *
 * NOTE: This could be replaced with S3 conditional puts (IfNoneMatch: "*")
 * for atomic operations at the storage level, which would work across
 * multiple server instances.
 */
const ongoingS3Writes = new Set<string>();

async function readWithTimeout<T>(promise: Promise<T>, assetId: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Read timeout exceeded for asset ${assetId}`));
    }, ASSET_STREAM_TIMEOUT_MS);

    promise
      .then(result => {
        clearTimeout(timeoutId);
        resolve(result);
        return null;
      })
      .catch(error => {
        clearTimeout(timeoutId);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
  });
}

function createMonitoredStream(
  source: ReadableStream<Uint8Array>,
  assetId: string,
  onViolation?: (error: Error) => void,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let processedBytes = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await readWithTimeout(reader.read(), assetId);

        if (done) {
          controller.close();
          return;
        }

        if (value) {
          processedBytes += value.byteLength;
          if (processedBytes > MAX_ASSET_SIZE_BYTES) {
            const sizeError = new Error(
              `Image too large: ${processedBytes} bytes exceeds ${MAX_ASSET_SIZE_BYTES} byte limit for asset ${assetId}`,
            );
            onViolation?.(sizeError);
            try {
              await reader.cancel(sizeError);
            } catch {
              // ignore cancel failures
            }
            controller.error(sizeError);
            return;
          }

          controller.enqueue(value);
        }
      } catch (error) {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        onViolation?.(normalizedError);
        try {
          await reader.cancel(normalizedError);
        } catch {
          // ignore cancel failures
        }
        controller.error(normalizedError);
      }
    },
    cancel(reason) {
      reader.cancel(reason).catch(() => {});
    },
  });
}

async function streamToBufferWithLimits(stream: ReadableStream<Uint8Array>, assetId: string): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  try {
    for (
      let result = await readWithTimeout(reader.read(), assetId);
      !result.done;
      result = await readWithTimeout(reader.read(), assetId)
    ) {
      const value = result.value;
      if (!value) {
        continue;
      }

      totalSize += value.byteLength;
      if (totalSize > MAX_ASSET_SIZE_BYTES) {
        const sizeError = new Error(
          `Image too large: ${totalSize} bytes exceeds ${MAX_ASSET_SIZE_BYTES} byte limit for asset ${assetId}`,
        );
        try {
          await reader.cancel(sizeError);
        } catch {
          // ignore cancel failures
        }
        throw sizeError;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks);
}

/**
 * Extracts the base URL from a bookmarks API URL more robustly
 * Handles various URL patterns and preserves path components other than /api/v1
 */
function getAssetBaseUrl(apiUrl: string): string {
  try {
    const url = new URL(apiUrl);
    const pathname = url.pathname;

    // Remove /api/v1 from the end if it exists, handling optional trailing slash
    const cleanedPathname = pathname.replace(/\/api\/v1\/?$/, "");

    return `${url.protocol}//${url.host}${cleanedPathname}`;
  } catch (error) {
    console.warn("[Assets API] URL parsing failed, using fallback:", error);
    // Fallback to regex replacement if URL parsing fails
    return apiUrl.replace(/\/api\/v1\/?$/, "");
  }
}

/**
 * Check if an asset exists in S3 and return its key if found.
 *
 * Lookup strategy:
 * 1. If context provided: Try descriptive filename (domain-hash.ext)
 * 2. Fallback: Try UUID-based filename (assetId.ext)
 *
 * @param assetId - Karakeep asset ID
 * @param context - Optional bookmark context for descriptive filenames
 * @param context.bookmarkId - Bookmark ID for hash generation
 * @param context.url - Bookmark URL for domain extraction
 * @returns S3 key and content type if found, null otherwise
 */
async function findAssetInS3(
  assetId: string,
  context?: {
    bookmarkId?: string;
    url?: string;
    domain?: string;
  },
): Promise<{ key: string; contentType: string } | null> {
  if (!process.env.S3_BUCKET || !s3Client) {
    return null;
  }

  // Build list once from central IMAGE_EXTENSIONS
  const extensions = IMAGE_EXTENSIONS.map(e => `.${e}`);

  // First, try to find with descriptive filename if context is available
  if (context?.bookmarkId && context?.url) {
    // Generate the expected descriptive key pattern
    // We need to compute the actual hash, not use "dummy"
    const { hashImageContent } = await import("@/lib/utils/opengraph-utils");
    const hash = hashImageContent(Buffer.from(`${context.url}:${context.bookmarkId}`)).substring(0, 8);
    const domain = stripWwwPrefix(new URL(context.url).hostname).replace(/\./g, "-");

    for (const ext of extensions) {
      const descriptiveKey = `${IMAGE_S3_PATHS.OPENGRAPH_DIR}/${domain}-${hash}${ext}`;

      try {
        const command = new HeadObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: descriptiveKey,
        });

        const response = await s3Client.send(command);
        console.log(`[Assets API] Found asset in S3 with descriptive name: ${descriptiveKey}`);

        return {
          key: descriptiveKey,
          contentType: response.ContentType || `image/${ext.substring(1)}`,
        };
      } catch {
        // Continue checking other patterns
      }
    }
  }

  // Fallback to UUID-based naming
  for (const ext of extensions) {
    const key = `${IMAGE_S3_PATHS.OPENGRAPH_DIR}/${assetId}${ext}`;
    try {
      const command = new HeadObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
      });

      const response = await s3Client.send(command);
      console.log(`[Assets API] Found asset in S3 with UUID name: ${key}`);

      return {
        key,
        contentType: response.ContentType || `image/${ext.substring(1)}`,
      };
    } catch {
      // Continue checking other extensions
    }
  }

  return null;
}

/**
 * Stream an asset from S3
 */
async function streamFromS3(key: string, contentType: string): Promise<NextResponse> {
  if (!process.env.S3_BUCKET || !s3Client) {
    throw new Error("S3 not configured");
  }

  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
  });

  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error("No body in S3 response");
  }

  const stream = convertS3BodyToWebStream(response.Body);

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400", // 7 days + 1 day stale
      ...IMAGE_SECURITY_HEADERS,
    },
  });
}

function hasTransformToWebStream(body: unknown): body is { transformToWebStream: () => ReadableStream<Uint8Array> } {
  return typeof (body as { transformToWebStream?: unknown }).transformToWebStream === "function";
}

function isReadableStream(body: unknown): body is ReadableStream<Uint8Array> {
  return typeof ReadableStream !== "undefined" && body instanceof ReadableStream;
}

function isBlob(body: unknown): body is Blob {
  return typeof Blob !== "undefined" && body instanceof Blob;
}

function convertS3BodyToWebStream(body: NonNullable<GetObjectCommandOutput["Body"]>): ReadableStream<Uint8Array> {
  const candidateBody: unknown = body;

  if (hasTransformToWebStream(candidateBody)) {
    return candidateBody.transformToWebStream() as unknown as ReadableStream<Uint8Array>;
  }

  if (isReadableStream(candidateBody)) {
    return candidateBody;
  }

  if (candidateBody instanceof Readable) {
    return Readable.toWeb(candidateBody) as unknown as ReadableStream<Uint8Array>;
  }

  if (isBlob(candidateBody)) {
    return candidateBody.stream() as unknown as ReadableStream<Uint8Array>;
  }

  if (candidateBody instanceof Uint8Array) {
    return createSingleChunkStream(candidateBody);
  }

  if (typeof candidateBody === "string") {
    return createSingleChunkStream(new TextEncoder().encode(candidateBody));
  }

  if (candidateBody instanceof ArrayBuffer) {
    return createSingleChunkStream(new Uint8Array(candidateBody));
  }

  if (ArrayBuffer.isView(candidateBody as ArrayBufferView)) {
    const view = candidateBody as ArrayBufferView;
    return createSingleChunkStream(new Uint8Array(view.buffer));
  }

  throw new Error("Unsupported S3 body type for streaming");
}

function createSingleChunkStream(chunk: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(chunk);
      controller.close();
    },
  });
}

/**
 * Save an asset to S3 with a descriptive filename when context is available.
 *
 * Features:
 * - Generates descriptive filenames (domain-hash.ext) when context available
 * - Falls back to UUID-based names (assetId.ext) without context
 * - Uses centralized persistence for consistent ACL settings
 * - Performs content-based deduplication via S3 HEAD check
 * - Uses in-memory lock to prevent concurrent writes (see saveAssetToS3Atomic for S3-level alternative)
 *
 * @param assetId - Karakeep asset ID
 * @param buffer - Image data to save
 * @param contentType - MIME type of the image
 * @param context - Optional bookmark context for descriptive filenames
 * @returns S3 key where asset was saved
 */
async function saveAssetToS3(
  assetId: string,
  buffer: Buffer,
  contentType: string,
  context?: {
    bookmarkId?: string;
    url?: string;
    domain?: string;
  },
): Promise<string> {
  if (!process.env.S3_BUCKET || !s3Client) {
    throw new Error("S3 not configured");
  }

  const extension = getExtensionFromContentType(contentType);
  let key: string;

  // Generate descriptive filename if context is available
  if (context?.bookmarkId && context?.url) {
    const { getOgImageS3Key, hashImageContent } = await import("@/lib/utils/opengraph-utils");
    key = getOgImageS3Key(
      `karakeep-asset-${assetId}`,
      IMAGE_S3_PATHS.OPENGRAPH_DIR,
      context.url,
      context.bookmarkId,
      hashImageContent(buffer),
    );
  } else {
    // Fallback to simple assetId-based naming
    key = `${IMAGE_S3_PATHS.OPENGRAPH_DIR}/${assetId}.${extension}`;
  }

  // Check if file already exists to avoid duplicate writes (content deduplication)
  try {
    const headCommand = new HeadObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
    });
    await s3Client.send(headCommand);
    console.log(`[Assets API] Asset already exists in S3, skipping write: ${key}`);
    return key;
  } catch {
    // File doesn't exist, proceed with upload
  }

  // Check if a write is already in progress for this key (prevents race conditions)
  if (ongoingS3Writes.has(key)) {
    console.log(`[Assets API] S3 write already in progress for: ${key}, skipping duplicate`);
    return key;
  }

  // Mark this write as in progress
  ongoingS3Writes.add(key);

  try {
    console.log(`[Assets API] Saving new asset to S3: ${key} (${buffer.length} bytes, ${contentType})`);

    // Always use centralized persistence function for consistency
    const { persistBinaryToS3 } = await import("@/lib/persistence/s3-persistence");
    await persistBinaryToS3(key, buffer, contentType);

    return key;
  } finally {
    // Always clean up the lock, even if write fails
    ongoingS3Writes.delete(key);
  }
}

// NOTE: Atomic S3 writes implementation removed.
// To implement atomic writes using S3 conditional puts (IfNoneMatch: "*"):
// 1. Add IfNoneMatch: "*" to PutObjectCommand for atomic write-once semantics
// 2. Handle 412 Precondition Failed as success (object already exists)
// 3. This approach works across multiple server instances without in-memory locks
// See git history for the complete implementation if needed.

/**
 * GET /api/assets/[assetId] - Proxy endpoint for Karakeep/Hoarder assets.
 *
 * Query parameters:
 * - bid: Bookmark ID for generating descriptive filenames
 * - url: Bookmark URL for domain extraction (validated for security)
 * - domain: Pre-extracted domain (optional optimization)
 *
 * Response:
 * - 200: Image data with appropriate content-type
 * - 400: Invalid asset ID or parameters
 * - 404: Asset not found in Karakeep
 * - 502: Karakeep service error
 * - 504: Timeout fetching from Karakeep
 *
 * @param request - Next.js request object with query parameters
 * @param params - Route parameters containing assetId
 * @returns Image response or error
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;

  // Extract context from query parameters for descriptive S3 filenames
  const requestUrl = new URL(request.url);
  const searchParams = requestUrl.searchParams;

  // Validate URL parameter to prevent security issues
  let validatedUrl: string | undefined;
  const urlParam = searchParams.get("url");
  if (urlParam) {
    try {
      const parsed = new URL(urlParam);
      // Only allow http/https URLs
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        validatedUrl = parsed.toString();
      }
    } catch {
      // Invalid URL, ignore it
    }
  }

  const context = {
    bookmarkId: searchParams.get("bid") || undefined,
    url: validatedUrl,
    domain: searchParams.get("domain") || undefined,
  };

  console.log(`[Assets API] Request for assetId: ${assetId}`);

  if (!assetId) {
    return NextResponse.json({ error: "Asset ID is required" }, { status: 400 });
  }

  // Validate asset ID to prevent path traversal
  const assetIdValidation = assetIdSchema.safeParse(assetId);
  if (!assetIdValidation.success) {
    console.error(`[Assets API] Invalid asset ID format: ${assetId}`);
    return NextResponse.json(
      { error: "Invalid asset ID format", details: assetIdValidation.error.issues[0]?.message },
      { status: 400 },
    );
  }

  try {
    // STEP 1: Check if asset exists in S3
    const s3Asset = await findAssetInS3(assetId, context);
    if (s3Asset) {
      console.log(`[Assets API] Serving from S3 storage: ${s3Asset.key}`);
      return streamFromS3(s3Asset.key, s3Asset.contentType);
    }

    // STEP 2: Asset not in S3, fetch from Karakeep/Hoarder
    console.log(`[Assets API] Asset not in S3, fetching from Karakeep: ${assetId}`);

    // Get the external bookmarks API URL
    const bookmarksApiUrl = process.env.BOOKMARKS_API_URL ?? "https://bookmark.iocloudhost.net/api/v1";
    // More robust base URL extraction
    const baseUrl = getAssetBaseUrl(bookmarksApiUrl);
    const bearerToken = process.env.BOOKMARK_BEARER_TOKEN;

    if (!bearerToken) {
      console.error("[Assets API] Bearer token not configured");
      return NextResponse.json({ error: "Service configuration error" }, { status: 500 });
    }

    // Construct the asset URL for the external service (non-versioned asset endpoint)
    const assetUrl = `${baseUrl}/api/assets/${assetId}`;

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    // Prepare headers for external request
    const fetchHeaders = {
      Authorization: `Bearer ${bearerToken}`,
      "User-Agent": "williamcallahan.com/1.0",
      Accept: "*/*",
    };

    let response: Response;
    try {
      // Fetch the asset from the external service
      response = await fetch(assetUrl, {
        headers: fetchHeaders,
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        console.error(`[Assets API] Timeout fetching asset ${assetId} after 30 seconds`);
        return NextResponse.json(
          {
            error: "Asset fetch timed out",
            assetId,
            message: "The external asset service is not responding",
          },
          { status: 504 }, // Gateway Timeout
        );
      }

      console.error(`[Assets API] Failed to fetch asset ${assetId}:`, error);
      return NextResponse.json(
        {
          error: "Failed to fetch asset",
          assetId,
        },
        { status: 502 }, // Bad Gateway
      );
    }

    if (!response.ok) {
      console.error(`[Assets API] Failed to fetch asset ${assetId}: ${response.status}`);
      return NextResponse.json(
        {
          error: "Failed to fetch asset",
          assetId,
        },
        { status: response.status },
      );
    }

    // Get the content type from the response
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const contentLengthHeader = response.headers.get("content-length");

    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (Number.isFinite(contentLength) && contentLength > MAX_ASSET_SIZE_BYTES) {
        console.error(
          `[Assets API] Asset ${assetId} rejected: content-length ${contentLength} exceeds ${MAX_ASSET_SIZE_BYTES} byte limit`,
        );
        if (response.body) {
          try {
            await response.body.cancel();
          } catch {
            // ignore cancel failures
          }
        }
        return NextResponse.json(
          {
            error: "Asset exceeds maximum allowed size",
            assetId,
          },
          { status: 413 },
        );
      }
    }

    // STEP 3: For images, stream to the client and optionally persist to S3
    if (contentType.startsWith("image/")) {
      const upstreamBody = response.body;

      if (!upstreamBody) {
        console.error(`[Assets API] No response body when fetching asset ${assetId}`);
        return NextResponse.json(
          {
            error: "Failed to read asset",
            assetId,
          },
          { status: 502 },
        );
      }

      const shouldPersist =
        process.env.IS_DATA_UPDATER === "true" && Boolean(process.env.S3_BUCKET) && Boolean(s3Client);
      let clientStream: ReadableStream<Uint8Array> = upstreamBody;
      let persistStream: ReadableStream<Uint8Array> | null = null;

      if (shouldPersist) {
        const [streamForClient, streamForPersistence] = upstreamBody.tee();
        clientStream = streamForClient;
        persistStream = streamForPersistence;
      }

      const monitoredStream = createMonitoredStream(clientStream, assetId, error => {
        console.error(`[Assets API] Streaming error for asset ${assetId}:`, error.message);
      });

      if (shouldPersist && persistStream) {
        void streamToBufferWithLimits(persistStream, assetId)
          .then(buffer => saveAssetToS3(assetId, buffer, contentType, context))
          .catch(error => {
            console.error(`[Assets API] Failed to save asset ${assetId} to S3:`, error);
          });
      }

      return new NextResponse(monitoredStream, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400", // 7 days + 1 day stale
          ...IMAGE_SECURITY_HEADERS,
        },
      });
    }

    // For non-images stream the upstream body directly
    if (!response.body) {
      console.error(`[Assets API] No response body for non-image asset ${assetId}`);
      return NextResponse.json(
        {
          error: "Failed to read asset",
          assetId,
        },
        { status: 502 },
      );
    }

    return new NextResponse(response.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400", // 7 days + 1 day stale
        ...IMAGE_SECURITY_HEADERS,
      },
    });
  } catch (error) {
    console.error(`[Assets API] Error for asset ${assetId}:`, error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      {
        error: "Internal server error",
        assetId,
      },
      { status: 500 },
    );
  }
}
