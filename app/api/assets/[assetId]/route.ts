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
import { HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "@/lib/s3-utils";
import { getExtensionFromContentType, IMAGE_EXTENSIONS } from "@/lib/utils/content-type";
import { IMAGE_S3_PATHS } from "@/lib/constants";
import { assetIdSchema } from "@/types/schemas/url";
import { IMAGE_SECURITY_HEADERS } from "@/lib/validators/url";

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
  }
): Promise<{ key: string; contentType: string } | null> {
  if (!process.env.S3_BUCKET || !s3Client) {
    return null;
  }

  // Build list once from central IMAGE_EXTENSIONS
  const extensions = IMAGE_EXTENSIONS.map((e) => `.${e}`);

  // First, try to find with descriptive filename if context is available
  if (context?.bookmarkId && context?.url) {
    // Generate the expected descriptive key pattern
    // We need to compute the actual hash, not use "dummy"
    const { hashImageContent } = await import("@/lib/utils/opengraph-utils");
    const hash = hashImageContent(Buffer.from(`${context.url}:${context.bookmarkId}`)).substring(0, 8);
    const domain = new URL(context.url).hostname.replace(/^www\./, "").replace(/\./g, "-");
    
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

  // Convert the readable stream to a web stream
  const stream = response.Body.transformToWebStream();

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400", // 7 days + 1 day stale
      ...IMAGE_SECURITY_HEADERS,
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
  }
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
      hashImageContent(buffer)
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

/**
 * Save an asset to S3 atomically using conditional puts.
 * 
 * This is an alternative to saveAssetToS3 that uses S3's conditional put feature
 * (IfNoneMatch: "*") to ensure atomic writes at the storage level. This approach
 * works across multiple server instances without needing in-memory locks.
 * 
 * Features:
 * - Uses S3 conditional puts for atomic operations (IfNoneMatch: "*")
 * - No need for in-memory locks - works across multiple servers
 * - Generates descriptive filenames when context available
 * - Returns existing key if write fails due to concurrent creation
 * 
 * NOTE: This function is intentionally unused - it's provided as an alternative
 * implementation that can be activated by uncommenting the call in line 554-556.
 * 
 * @param assetId - Karakeep asset ID
 * @param buffer - Image data to save
 * @param contentType - MIME type of the image
 * @param context - Optional bookmark context for descriptive filenames
 * @returns S3 key where asset was saved
 * @unused Intentional alternative implementation
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function saveAssetToS3Atomic(
  assetId: string,
  buffer: Buffer,
  contentType: string,
  context?: {
    bookmarkId?: string;
    url?: string;
    domain?: string;
  }
): Promise<string> {
  if (!process.env.S3_BUCKET || !s3Client) {
    throw new Error("S3 not configured");
  }

  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
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
      hashImageContent(buffer)
    );
  } else {
    // Fallback to simple assetId-based naming
    key = `${IMAGE_S3_PATHS.OPENGRAPH_DIR}/${assetId}.${extension}`;
  }

  try {
    console.log(`[Assets API] Attempting atomic S3 write: ${key} (${buffer.length} bytes, ${contentType})`);

    // Use conditional put with IfNoneMatch: "*" to ensure atomic write
    // This will only succeed if the object doesn't already exist
    const putCommand = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: "public-read",
      CacheControl: "public, max-age=31536000, immutable",
      IfNoneMatch: "*", // This makes the operation atomic - only write if doesn't exist
    });

    await s3Client.send(putCommand);
    console.log(`[Assets API] Successfully wrote asset atomically to S3: ${key}`);
    return key;
  } catch (error: unknown) {
    // Type guard for AWS SDK errors
    const awsError = error as { $metadata?: { httpStatusCode?: number }; Code?: string; message?: string };
    
    // Check if the error is because the object already exists (412 Precondition Failed)
    if (awsError.$metadata?.httpStatusCode === 412 || awsError.Code === "PreconditionFailed") {
      console.log(`[Assets API] Asset already exists (atomic check): ${key}`);
      return key; // File already exists, that's fine
    }
    
    // Re-throw other errors
    console.error(`[Assets API] Failed to write asset atomically: ${awsError.message || error}`);
    throw error;
  }
}

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
  const searchParams = request.nextUrl.searchParams;
  
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
      { error: "Invalid asset ID format", details: assetIdValidation.error.errors[0]?.message },
      { status: 400 },
    );
  }

  try {
    // STEP 1: Check if asset exists in S3
    const s3Asset = await findAssetInS3(assetId, context);
    if (s3Asset) {
      console.log(`[Assets API] Serving from S3 cache: ${s3Asset.key}`);
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

    // STEP 3: For images, buffer and save to S3, otherwise stream directly
    if (contentType.startsWith("image/") && process.env.S3_BUCKET && s3Client) {
      try {
        // Set a timeout for reading the response body
        const readController = new AbortController();
        const readTimeoutId = setTimeout(() => readController.abort(), 20000); // 20 second read timeout

        const chunks: Uint8Array[] = [];
        let totalSize = 0;
        const MAX_SIZE = 50 * 1024 * 1024; // 50MB limit
        const reader = response.body?.getReader();

        if (!reader) {
          throw new Error("No response body");
        }

        while (true) {
          const readPromise = reader.read();

          const timeoutPromise = new Promise<never>((_, reject) => {
            const abortHandler = () => reject(new Error("Read timeout"));
            // The `{ once: true }` option guarantees we attach the handler
            // only for this iteration and it is removed automatically after
            // the first invocation – prevents listener accumulation.
            readController.signal.addEventListener("abort", abortHandler, {
              once: true,
            });
          });

          try {
            const { done, value } = await Promise.race([readPromise, timeoutPromise]);
            if (done) break;
            if (value) {
              totalSize += value.length;
              if (totalSize > MAX_SIZE) {
                await reader.cancel();
                throw new Error(`Image too large: ${totalSize} bytes exceeds ${MAX_SIZE} byte limit`);
              }
              chunks.push(value);
            }
          } catch (error) {
            // Ensure the reader is promptly canceled to free resources
            if (typeof reader.cancel === "function") {
              await reader.cancel();
            }
            throw error;
          }
        }

        // All chunks read successfully – clean-up resources
        reader.releaseLock();
        clearTimeout(readTimeoutId);

        const buffer = Buffer.concat(chunks);

        // Save to S3 in the background (don't block the response)
        // Only save if we're in data updater mode to avoid conflicts
        if (process.env.IS_DATA_UPDATER === "true") {
          // Option 1: Use in-memory locks (current implementation)
          saveAssetToS3(assetId, buffer, contentType, context).catch((error) => {
            console.error(`[Assets API] Failed to save asset ${assetId} to S3:`, error);
          });
          
          // Option 2: Use S3 conditional puts for atomic writes (uncomment to use)
          // This approach works better across multiple server instances
          // saveAssetToS3Atomic(assetId, buffer, contentType, context).catch((error) => {
          //   console.error(`[Assets API] Failed to save asset ${assetId} to S3:`, error);
          // });
        }

        // Return the asset
        return new NextResponse(buffer, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400", // 7 days + 1 day stale
            ...IMAGE_SECURITY_HEADERS,
          },
        });
      } catch (error) {
        console.error(`[Assets API] Error reading asset ${assetId}:`, error);
        return NextResponse.json(
          {
            error: "Failed to read asset",
            assetId,
          },
          { status: 504 }, // Gateway Timeout
        );
      }
    } else {
      // For non-images or when S3 is not configured, stream directly
      return new NextResponse(response.body, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400", // 7 days + 1 day stale
          ...IMAGE_SECURITY_HEADERS,
        },
      });
    }
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
