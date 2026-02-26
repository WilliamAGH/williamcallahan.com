/**
 * S3 JSON Operations
 *
 * Strict JSON read/write helpers. Always throw on parse/validation errors.
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
import {
  assertJsonContentType,
  deleteFromS3,
  getObject,
  headObject,
  listS3Objects,
  putObject,
} from "./objects";

function isPostgresJsonStoreEnabled(): boolean {
  return process.env.NODE_ENV === "production";
}

export async function readJsonS3<T>(s3Key: string, schema: ZodSchema<T>): Promise<T> {
  let parsed: unknown;
  if (isPostgresJsonStoreEnabled()) {
    const payload = await getJsonDocumentPayloadByKey(s3Key);
    if (payload === null) {
      throw new S3NotFoundError({ operation: "readJsonS3", key: s3Key });
    }
    parsed = payload;
  } else {
    // Let typed S3 errors propagate unchanged; only wrap truly unexpected errors
    const { body, contentType } = await getObject(s3Key);
    assertJsonContentType(s3Key, contentType);
    try {
      parsed = JSON.parse(body.toString("utf-8"));
    } catch (error) {
      throw new S3JsonParseError({ operation: "readJsonS3", key: s3Key }, error);
    }
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

export async function readJsonS3Unchecked(s3Key: string): Promise<unknown> {
  if (isPostgresJsonStoreEnabled()) {
    const payload = await getJsonDocumentPayloadByKey(s3Key);
    if (payload === null) {
      throw new S3NotFoundError({ operation: "readJsonS3Unchecked", key: s3Key });
    }
    return payload;
  }

  const { body, contentType } = await getObject(s3Key);
  assertJsonContentType(s3Key, contentType);
  try {
    return JSON.parse(body.toString("utf-8"));
  } catch (error) {
    throw new S3JsonParseError({ operation: "readJsonS3Unchecked", key: s3Key }, error);
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

  if (isPostgresJsonStoreEnabled()) {
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
    return;
  }

  await putObject(s3Key, jsonData, {
    contentType: "application/json",
    acl: "public-read",
    ifNoneMatch: options?.ifNoneMatch,
  });
}

export async function listJsonS3Keys(prefix: string): Promise<string[]> {
  if (isPostgresJsonStoreEnabled()) {
    return listJsonDocumentKeysByPrefix(prefix);
  }
  return listS3Objects(prefix);
}

export async function getJsonS3Metadata(s3Key: string): Promise<S3ObjectMetadata> {
  if (isPostgresJsonStoreEnabled()) {
    const metadata = await getJsonDocumentMetadataByKey(s3Key);
    if (!metadata) {
      throw new S3NotFoundError({ operation: "headObject", key: s3Key });
    }
    return metadata;
  }

  return headObject(s3Key);
}

export async function deleteJsonS3(s3Key: string): Promise<void> {
  if (isPostgresJsonStoreEnabled()) {
    await deleteJsonDocumentByKey(s3Key);
    return;
  }

  await deleteFromS3(s3Key);
}
