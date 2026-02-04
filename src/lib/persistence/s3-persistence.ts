/**
 * Centralized S3 Persistence Module
 *
 * Provides a unified interface for all S3 write operations with guaranteed
 * public-read ACL settings for DigitalOcean Spaces compatibility.
 *
 * @module persistence/s3-persistence
 */

import { Readable } from "node:stream";
import { readJsonS3Optional, writeJsonS3 } from "@/lib/s3/json";
import { writeBinaryS3 } from "@/lib/s3/binary";
import { putObject } from "@/lib/s3/objects";
import { debug, isDebug } from "@/lib/utils/debug";
import { hashUrl, normalizeUrl } from "@/lib/utils/opengraph-utils";
import { OPENGRAPH_OVERRIDES_S3_DIR } from "@/lib/constants";
import type { OgResult } from "@/types";
import { OgError } from "@/types/opengraph";
import { ContentCategory } from "@/types/s3-cdn";
import { ogResultSchema } from "@/types/seo/opengraph";

/**
 * Determine content category based on content type and path
 */
function getContentCategory(contentType: string | undefined, s3Key: string): ContentCategory {
  // Images are always public assets
  if (contentType?.startsWith("image/")) return ContentCategory.PublicAsset;

  // JSON data is typically public for this application
  if (contentType === "application/json" || s3Key.endsWith(".json")) {
    return ContentCategory.PublicData;
  }

  // HTML content (like Jina AI caches)
  if (contentType?.includes("text/html") || s3Key.endsWith(".html")) {
    return ContentCategory.Html;
  }

  // CSS/JS are public assets
  if (contentType?.includes("text/css") || contentType?.includes("javascript")) {
    return ContentCategory.PublicAsset;
  }

  // Default to public data for safety (aligns with bucket policy)
  return ContentCategory.PublicData;
}

/**
 * Persist any content to S3 with appropriate ACL settings
 *
 * @param s3Key - The S3 object key
 * @param data - The data to write (string, Buffer, or Readable stream)
 * @param contentType - The MIME type of the content
 * @param forcePrivate - Force private ACL regardless of content type
 */
export async function persistToS3(
  s3Key: string,
  data: Buffer | string | Readable,
  contentType?: string,
  forcePrivate = false,
): Promise<void> {
  const category = getContentCategory(contentType, s3Key);

  // Determine ACL based on content category and force flag
  let acl: "private" | "public-read" = "public-read"; // Default to public

  if (forcePrivate || category === ContentCategory.PrivateData) {
    acl = "private";
  }

  if (isDebug) {
    debug(
      `[S3 Persistence] Writing to ${s3Key} with ACL: ${acl}, ContentType: ${contentType || "auto"}`,
    );
  } else {
    console.log(`[S3 Persistence] Writing to ${s3Key} with ACL: ${acl}`);
  }

  await putObject(s3Key, data, { contentType, acl });
}

/**
 * Persist JSON data to S3 (always public-read for this application)
 *
 * @param s3Key - The S3 object key
 * @param data - The JSON data to persist
 */
export async function persistJsonToS3<T>(s3Key: string, data: T): Promise<void> {
  if (isDebug) {
    debug(`[S3 Persistence] Writing JSON to ${s3Key} with public-read ACL`);
  }

  // writeJsonS3 already sets public-read ACL
  await writeJsonS3(s3Key, data);
}

/**
 * Persist binary data to S3 (always public-read for images)
 *
 * @param s3Key - The S3 object key
 * @param data - The binary data (Buffer or Readable stream)
 * @param contentType - The MIME type of the content
 */
export async function persistBinaryToS3(
  s3Key: string,
  data: Buffer | Readable,
  contentType: string,
): Promise<void> {
  if (isDebug) {
    debug(
      `[S3 Persistence] Writing binary to ${s3Key} with public-read ACL, ContentType: ${contentType}`,
    );
  }

  // writeBinaryS3 already sets public-read ACL
  await writeBinaryS3(s3Key, data, contentType);
}

/**
 * Retrieve a hardcoded OpenGraph override from S3
 *
 * @param url - The original URL to look up
 * @returns The override data or null if not found
 * @throws S3OperationError on real S3 failures (permissions, network, etc.)
 */
export async function getS3Override(url: string): Promise<OgResult | null> {
  const s3Key = `${OPENGRAPH_OVERRIDES_S3_DIR}/${hashUrl(normalizeUrl(url))}.json`;

  // readJsonS3Optional returns null for 404 and throws for real errors
  // Do not catch - let real S3 errors propagate to caller per [RC1a]
  const override = await readJsonS3Optional(s3Key, ogResultSchema);
  if (override) {
    debug(`[DataAccess/OpenGraph] Found S3 override for ${url}`);
  }
  return override;
}

/**
 * Persist an OpenGraph override to S3
 *
 * @param url - The original URL
 * @param data - The OpenGraph data to store
 */
export async function persistS3Override(url: string, data: OgResult): Promise<void> {
  const s3Key = `${OPENGRAPH_OVERRIDES_S3_DIR}/${hashUrl(normalizeUrl(url))}.json`;

  try {
    await persistJsonToS3(s3Key, data);
    debug(`[DataAccess/OpenGraph] Successfully persisted S3 override for ${url}`);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const ogError = new OgError(`Error persisting S3 override for ${url}`, "s3-write-override", {
      originalError: error,
    });
    debug(`[DataAccess/OpenGraph] ${ogError.message}`);
  }
}
