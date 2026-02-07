/**
 * Image Fetch and Processing Utilities
 * @module lib/services/image/image-fetcher
 * @description
 * Functions for fetching images from URLs and processing them for S3 storage.
 * Extracted from unified-image-service for SRP compliance per [MO1d].
 */

import { getS3Client } from "@/lib/s3/client";
import { fetchWithTimeout, DEFAULT_IMAGE_HEADERS } from "@/lib/utils/http-client";
import { normalizeError } from "@/lib/utils/error-utils";
import { DEFAULT_IMAGE_CONTENT_TYPE, DEFAULT_BINARY_CONTENT_TYPE } from "@/lib/utils/content-type";
import { isLogoUrl, extractDomain } from "@/lib/utils/url-utils";
import { getMemoryHealthMonitor } from "@/lib/health/memory-health-monitor";
import { maybeStreamImageToS3 } from "../image-streaming";
import type { ImageServiceOptions, FetchProcessResult, ImageFetchConfig } from "@/types/image";
import type { LogoFetcher } from "./logo-fetcher";

/**
 * Attempts to stream the image response to S3
 * Returns true if streaming succeeded, false otherwise
 */
async function attemptS3Streaming(
  response: Response,
  url: string,
  contentType: string,
  s3Ops: ImageFetchConfig["s3Ops"],
  options: ImageServiceOptions,
): Promise<boolean> {
  const s3Key = s3Ops.generateS3Key(url, options);
  if (options.skipUpload) return false;

  const s3Client = getS3Client();
  return maybeStreamImageToS3(response, {
    bucket: process.env.S3_BUCKET || "",
    key: s3Key,
    s3Client,
  });
}

/**
 * Refetches image if body was already consumed
 */
async function ensureResponseBody(
  response: Response,
  url: string,
  timeout: number,
): Promise<{ response: Response; contentType: string }> {
  if (!response.bodyUsed) {
    const ct = response.headers.get("content-type");
    return { response, contentType: ct || DEFAULT_BINARY_CONTENT_TYPE };
  }

  const refetch = await fetchWithTimeout(url, {
    headers: DEFAULT_IMAGE_HEADERS,
    timeout,
  });
  if (!refetch.ok) {
    throw new Error(`HTTP ${refetch.status}: ${refetch.statusText}`);
  }
  const refetchContentType = refetch.headers.get("content-type");
  if (!refetchContentType?.startsWith("image/")) {
    throw new Error("Response is not an image");
  }
  return { response: refetch, contentType: refetchContentType || DEFAULT_BINARY_CONTENT_TYPE };
}

/**
 * Fetch and process an image from URL.
 * Handles streaming to S3 when available, with fallback to buffered processing.
 */
export async function fetchAndProcessImage(
  url: string,
  options: ImageServiceOptions,
  config: ImageFetchConfig,
): Promise<FetchProcessResult> {
  const {
    devProcessingDisabled,
    devStreamImagesToS3,
    isDev,
    shouldAcceptRequests,
    logoFetcher,
    placeholderBuffer,
    fetchTimeout,
  } = config;

  const timeout = options.timeoutMs ?? fetchTimeout;

  // Dev gating: skip fetch/processing entirely when disabled in development
  if (devProcessingDisabled && !devStreamImagesToS3) {
    return { buffer: placeholderBuffer, contentType: DEFAULT_IMAGE_CONTENT_TYPE };
  }

  // Check memory before fetching unless we are in streaming mode
  if (!shouldAcceptRequests()) {
    throw new Error("Insufficient memory to fetch image");
  }

  // Handle logo URLs specially
  if (isLogoUrl(url)) {
    return handleLogoUrl(url, logoFetcher);
  }

  // Fetch the image
  const response = await fetchWithTimeout(url, {
    headers: DEFAULT_IMAGE_HEADERS,
    timeout,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type");
  if (!contentType?.startsWith("image/")) {
    throw new Error("Response is not an image");
  }

  try {
    // Attempt to stream directly to S3
    const streamed = await attemptS3Streaming(
      response,
      url,
      contentType || DEFAULT_BINARY_CONTENT_TYPE,
      config.s3Ops,
      options,
    );
    if (streamed) {
      return {
        buffer: Buffer.alloc(0),
        contentType: contentType || DEFAULT_BINARY_CONTENT_TYPE,
        streamedToS3: true,
      };
    }

    // Streaming failed - check if we can fall back to buffering
    if (devStreamImagesToS3 && !isDev && !getMemoryHealthMonitor().shouldAcceptNewRequests()) {
      throw new Error("Streaming required but unavailable under memory pressure");
    }

    // Check memory again before loading into buffer
    if (!shouldAcceptRequests()) {
      throw new Error("Insufficient memory to load image into buffer");
    }

    // Handle body already consumed case and get buffer
    const { response: finalResponse, contentType: finalContentType } = await ensureResponseBody(
      response,
      url,
      timeout,
    );

    const arrayBuffer = await finalResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return { buffer, contentType: finalContentType };
  } catch (error) {
    // ER2 Compliance: Preserve error context for non-Error objects
    throw normalizeError(error, { operation: "fetchAndProcess", url });
  }
}

/** Handle logo URL by delegating to logo fetcher */
async function handleLogoUrl(url: string, logoFetcher: LogoFetcher): Promise<FetchProcessResult> {
  const logoResult = await logoFetcher.fetchExternalLogo(extractDomain(url));
  if (!logoResult?.buffer) {
    throw new Error("Failed to fetch logo");
  }
  const result = {
    buffer: logoResult.buffer,
    contentType: logoResult.contentType || DEFAULT_IMAGE_CONTENT_TYPE,
  };
  // Clear the original buffer to help GC
  logoResult.buffer = Buffer.alloc(0);
  return result;
}
