/**
 * Asset Proxy API Route with S3 Write-Through Cache
 *
 * Proxies asset requests to the external bookmarks service (Karakeep/Hoarder)
 * and caches OpenGraph images in S3 with proper file extensions for improved performance
 */

import { type NextRequest, NextResponse } from "next/server";
import { HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, writeBinaryS3 } from "@/lib/s3-utils";
import { getExtensionFromContentType, IMAGE_EXTENSIONS } from "@/lib/utils/content-type";
import { IMAGE_S3_PATHS } from "@/lib/constants";

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
 * Check if an asset exists in S3 and return its key if found
 */
async function findAssetInS3(assetId: string): Promise<{ key: string; contentType: string } | null> {
  if (!process.env.S3_BUCKET || !s3Client) {
    return null;
  }

  // Build list once from central IMAGE_EXTENSIONS
  const extensions = IMAGE_EXTENSIONS.map((e) => `.${e}`);

  for (const ext of extensions) {
    const key = `${IMAGE_S3_PATHS.OPENGRAPH_DIR}/${assetId}${ext}`;
    try {
      const command = new HeadObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
      });

      const response = await s3Client.send(command);
      console.log(`[Assets API] Found asset in S3: ${key}`);

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
      "Cache-Control": "public, max-age=31536000, immutable", // Cache for 1 year
    },
  });
}

/**
 * Save an asset to S3 with the correct extension
 */
async function saveAssetToS3(assetId: string, buffer: Buffer, contentType: string): Promise<string> {
  if (!process.env.S3_BUCKET || !s3Client) {
    throw new Error("S3 not configured");
  }

  const extension = getExtensionFromContentType(contentType);
  const key = `${IMAGE_S3_PATHS.OPENGRAPH_DIR}/${assetId}${extension}`;

  console.log(`[Assets API] Saving asset to S3: ${key} (${buffer.length} bytes, ${contentType})`);

  await writeBinaryS3(key, buffer, contentType);

  return key;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;

  console.log(`[Assets API] Request for assetId: ${assetId}`);

  if (!assetId) {
    return NextResponse.json({ error: "Asset ID is required" }, { status: 400 });
  }

  try {
    // STEP 1: Check if asset exists in S3
    const s3Asset = await findAssetInS3(assetId);
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
            chunks.push(value);
          } catch (error) {
            // Ensure the reader is promptly cancelled to free resources
            await reader.cancel();
            throw error;
          }
        }

        // All chunks read successfully – clean-up resources
        reader.releaseLock();
        clearTimeout(readTimeoutId);

        const buffer = Buffer.concat(chunks);

        // Save to S3 in the background (don't block the response)
        saveAssetToS3(assetId, buffer, contentType).catch((error) => {
          console.error(`[Assets API] Failed to save asset ${assetId} to S3:`, error);
        });

        // Return the asset
        return new NextResponse(buffer, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000, immutable", // Cache for 1 year
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
          "Cache-Control": "public, max-age=31536000, immutable", // Cache for 1 year
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
