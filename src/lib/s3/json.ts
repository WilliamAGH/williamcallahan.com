/**
 * S3 JSON Operations
 *
 * Strict JSON read/write helpers. Always throw on parse/validation errors.
 *
 * @module lib/s3/json
 */

import type { ZodSchema } from "zod/v4";
import { safeJsonStringify } from "@/lib/utils/json-utils";
import { S3JsonParseError, S3NotFoundError } from "./errors";
import { assertJsonContentType, getObject, putObject } from "./objects";

export async function readJsonS3<T>(s3Key: string, schema: ZodSchema<T>): Promise<T> {
  // Let typed S3 errors propagate unchanged; only wrap truly unexpected errors
  const { body, contentType } = await getObject(s3Key);
  assertJsonContentType(s3Key, contentType);

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString("utf-8"));
  } catch (error) {
    throw new S3JsonParseError({ operation: "readJsonS3", key: s3Key }, error);
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

  await putObject(s3Key, jsonData, {
    contentType: "application/json",
    acl: "public-read",
    ifNoneMatch: options?.ifNoneMatch,
  });
}
