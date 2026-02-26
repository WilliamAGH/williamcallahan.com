/**
 * S3 JSON Operations
 *
 * Strict JSON read/write helpers backed by PostgreSQL `json_documents`.
 * S3 key strings are retained as stable identifiers for compatibility.
 *
 * @module lib/s3/json
 */

import type { ZodSchema } from "zod/v4";
import {
  getJsonDocumentMetadataByKey,
  getJsonDocumentPayloadByKey,
  listJsonDocumentKeysByPrefix,
} from "@/lib/db/queries/json-documents";
import { deleteJsonDocumentByKey, upsertJsonDocument } from "@/lib/db/mutations/json-documents";
import { safeJsonStringify } from "@/lib/utils/json-utils";
import type { S3ObjectMetadata } from "@/types/s3-cdn";
import { S3JsonParseError, S3NotFoundError } from "./errors";

export async function readJsonS3<T>(s3Key: string, schema: ZodSchema<T>): Promise<T> {
  const parsed = await getJsonDocumentPayloadByKey(s3Key);
  if (parsed === null) {
    throw new S3NotFoundError({ operation: "readJsonS3", key: s3Key });
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new S3JsonParseError({ operation: "readJsonS3", key: s3Key }, result.error);
  }
  return result.data;
}

export async function readJsonS3Optional<T>(
  s3Key: string,
  schema: ZodSchema<T>,
): Promise<T | null> {
  try {
    return await readJsonS3(s3Key, schema);
  } catch (error: unknown) {
    if (error instanceof S3NotFoundError) return null;
    throw error;
  }
}

export async function writeJsonS3<T>(
  s3Key: string,
  data: T,
  options?: { ifNoneMatch?: "*" },
): Promise<void> {
  const jsonData = safeJsonStringify(data, 2);
  if (!jsonData) {
    throw new S3JsonParseError(
      { operation: "writeJsonS3", key: s3Key },
      "Failed to stringify JSON data",
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(jsonData);
  } catch (error) {
    throw new S3JsonParseError({ operation: "writeJsonS3", key: s3Key }, error);
  }

  await upsertJsonDocument({
    key: s3Key,
    payload,
    contentType: "application/json",
    ifNoneMatch: options?.ifNoneMatch,
  });
}

export async function listJsonS3Keys(prefix: string): Promise<string[]> {
  return listJsonDocumentKeysByPrefix(prefix);
}

export async function getJsonS3Metadata(s3Key: string): Promise<S3ObjectMetadata> {
  const metadata = await getJsonDocumentMetadataByKey(s3Key);
  if (!metadata) {
    throw new S3NotFoundError({ operation: "headObject", key: s3Key });
  }
  return metadata;
}

export async function deleteJsonS3(s3Key: string): Promise<void> {
  await deleteJsonDocumentByKey(s3Key);
}
