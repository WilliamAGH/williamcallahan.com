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
 * - Check S3 for existing asset using canonical `assetId` key resolution
 * - Fetch from Karakeep if not in S3
 * - Save to S3 in background for future requests
 *
 * @see {@link findAssetInS3} for S3 lookup logic
 * @see {@link saveAssetToS3} for S3 persistence logic
 */

import { type NextRequest, NextResponse } from "next/server";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "@/lib/s3/client";
import { getS3Config } from "@/lib/s3/config";
import { getExtensionFromContentType, IMAGE_EXTENSIONS } from "@/lib/utils/content-type";
import { IMAGE_S3_PATHS } from "@/lib/constants";
import { assetIdSchema } from "@/types/schemas/url";
import { IMAGE_SECURITY_HEADERS, IMAGE_CDN_CACHE_HEADERS } from "@/lib/validators/url";
import { createMonitoredStream, streamToBufferWithLimits } from "@/lib/utils/stream-utils";
import { buildCdnUrl, getCdnConfigFromEnv } from "@/lib/utils/cdn-utils";
import { isS3NotFound } from "@/lib/utils/s3-error-guards";

const MAX_ASSET_SIZE_BYTES = 50 * 1024 * 1024; // 50MB limit
const CDN_FETCH_TIMEOUT_MS = 15_000; // 15s — shorter than Karakeep's 30s
const DEFAULT_BOOKMARKS_API_URL = "https://bookmark.iocloudhost.net/api/v1";

const getS3Context = () => {
  const { bucket } = getS3Config();
  return { bucket, s3Client: getS3Client() };
};

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
 * 1. Resolve canonical key by `assetId` + known image extension.
 * 2. Return first matching object.
 *
 * @param assetId - Karakeep asset ID
 * @returns S3 key and content type if found, null otherwise
 */
async function findAssetInS3(
  assetId: string,
): Promise<{ key: string; contentType: string } | null> {
  const { bucket, s3Client } = getS3Context();

  // Build list once from central IMAGE_EXTENSIONS
  const extensions = IMAGE_EXTENSIONS.map((e) => `.${e}`);

  // Resolve canonical key by assetId
  for (const ext of extensions) {
    const key = `${IMAGE_S3_PATHS.OPENGRAPH_DIR}/${assetId}${ext}`;
    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const response = await s3Client.send(command);
      console.log(`[Assets API] Found asset in S3 with UUID name: ${key}`);

      return {
        key,
        contentType: response.ContentType || `image/${ext.substring(1)}`,
      };
    } catch (error) {
      if (!isS3NotFound(error)) {
        // Auth, network, rate-limit — propagate so caller sees the real failure
        throw error;
      }
      // S3 object not found at UUID path — expected during key resolution
      console.debug(`[Assets API] S3 object not found: ${key}`);
    }
  }

  return null;
}

/**
 * Stream an asset via the CDN URL instead of fetching directly from S3 origin.
 * This routes bandwidth through DigitalOcean Spaces CDN (and eventually Cloudflare)
 * rather than hitting the S3 API directly with GetObjectCommand.
 *
 * @throws {Error} on CDN failure (timeout, non-2xx, missing body) — callers
 *   must catch and return an appropriate HTTP status (502/504).
 */
async function streamFromCdn(key: string, contentType: string): Promise<NextResponse> {
  const cdnUrl = buildCdnUrl(key, getCdnConfigFromEnv());

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CDN_FETCH_TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch(cdnUrl, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!upstream.ok || !upstream.body) {
    throw new Error(`CDN fetch failed for ${cdnUrl}: ${upstream.status}`);
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      ...IMAGE_CDN_CACHE_HEADERS,
      ...IMAGE_SECURITY_HEADERS,
    },
  });
}

/**
 * Save an asset to S3 using canonical asset ID naming.
 *
 * Features:
 * - Uses canonical UUID-based names (assetId.ext)
 * - Uses centralized persistence for consistent ACL settings
 * - Performs content-based deduplication via S3 HEAD check
 * - Uses in-memory lock to prevent concurrent writes (see saveAssetToS3Atomic for S3-level alternative)
 *
 * @param assetId - Karakeep asset ID
 * @param buffer - Image data to save
 * @param contentType - MIME type of the image
 * @returns S3 key where asset was saved
 */
async function saveAssetToS3(
  assetId: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const { bucket, s3Client } = getS3Context();

  const extension = getExtensionFromContentType(contentType);
  const key = `${IMAGE_S3_PATHS.OPENGRAPH_DIR}/${assetId}.${extension}`;

  // Check if file already exists to avoid duplicate writes (content deduplication)
  try {
    const headCommand = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    await s3Client.send(headCommand);
    console.log(`[Assets API] Asset already exists in S3, skipping write: ${key}`);
    return key;
  } catch {
    // S3 object not found - this is expected, proceed with upload
    console.debug(`[Assets API] S3 object not found (will upload): ${key}`);
  }

  // Check if a write is already in progress for this key (prevents race conditions)
  if (ongoingS3Writes.has(key)) {
    console.log(`[Assets API] S3 write already in progress for: ${key}, skipping duplicate`);
    return key;
  }

  // Mark this write as in progress
  ongoingS3Writes.add(key);

  try {
    console.log(
      `[Assets API] Saving new asset to S3: ${key} (${buffer.length} bytes, ${contentType})`,
    );

    // Always use centralized persistence function for consistency
    const { persistBinaryToS3 } = await import("@/lib/persistence/s3-persistence");
    await persistBinaryToS3(key, buffer, contentType);

    return key;
  } finally {
    // Always clean up the lock, even if write fails
    ongoingS3Writes.delete(key);
  }
}

/**
 * GET /api/assets/[assetId] - Proxy endpoint for Karakeep/Hoarder assets.
 *
 * Query parameters:
 * - Additional query parameters are ignored (for backward compatibility with older links)
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
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await params;

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
    // STEP 1: Check if asset exists in S3 → stream via CDN
    const s3Asset = await findAssetInS3(assetId);
    if (s3Asset) {
      console.log(`[Assets API] Serving from CDN: ${s3Asset.key}`);
      try {
        return await streamFromCdn(s3Asset.key, s3Asset.contentType);
      } catch (cdnError) {
        const isTimeout = cdnError instanceof Error && cdnError.name === "AbortError";
        const status = isTimeout ? 504 : 502;
        console.error(
          `[Assets API] CDN ${isTimeout ? "timeout" : "error"} for ${s3Asset.key}:`,
          cdnError instanceof Error ? cdnError.message : String(cdnError),
        );
        return NextResponse.json({ error: "CDN fetch failed", assetId }, { status });
      }
    }

    // STEP 2: Asset not in S3, fetch from Karakeep/Hoarder
    console.log(`[Assets API] Asset not in S3, fetching from Karakeep: ${assetId}`);

    // Get the external bookmarks API URL
    const envBookmarksApiUrl = process.env.BOOKMARKS_API_URL;
    if (!envBookmarksApiUrl) {
      console.warn(
        `[Assets API] BOOKMARKS_API_URL env var is missing. Using fallback: ${DEFAULT_BOOKMARKS_API_URL}`,
      );
    }
    const bookmarksApiUrl = envBookmarksApiUrl ?? DEFAULT_BOOKMARKS_API_URL;
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

      let canPersistToS3 = false;
      try {
        getS3Context();
        canPersistToS3 = true;
      } catch {
        canPersistToS3 = false;
      }
      const shouldPersist = process.env.IS_DATA_UPDATER === "true" && canPersistToS3;
      let clientStream: ReadableStream<Uint8Array> = upstreamBody;
      let persistStream: ReadableStream<Uint8Array> | null = null;

      if (shouldPersist) {
        const [streamForClient, streamForPersistence] = upstreamBody.tee();
        clientStream = streamForClient;
        persistStream = streamForPersistence;
      }

      const monitoredStream = createMonitoredStream(clientStream, assetId, (error) => {
        console.error(`[Assets API] Streaming error for asset ${assetId}:`, error.message);
      });

      if (shouldPersist && persistStream) {
        void streamToBufferWithLimits(persistStream, assetId)
          .then((buffer) => saveAssetToS3(assetId, buffer, contentType))
          .catch((error) => {
            console.error(`[Assets API] Failed to save asset ${assetId} to S3:`, error);
          });
      }

      return new NextResponse(monitoredStream, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000, immutable",
          ...IMAGE_CDN_CACHE_HEADERS,
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
        "Cache-Control": "public, max-age=31536000, immutable",
        ...IMAGE_CDN_CACHE_HEADERS,
        ...IMAGE_SECURITY_HEADERS,
      },
    });
  } catch (error) {
    console.error(
      `[Assets API] Error for asset ${assetId}:`,
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json(
      {
        error: "Internal server error",
        assetId,
      },
      { status: 500 },
    );
  }
}
