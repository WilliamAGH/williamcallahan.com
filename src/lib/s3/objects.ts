/**
 * S3 Object Operations
 *
 * Raw S3 operations only: get, put, head, list, delete, exists.
 * No JSON parsing, no CDN logic, no memory policy.
 *
 * @module lib/s3/objects
 */

import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import type { S3ErrorContext, S3ObjectData, S3ObjectMetadata } from "@/types/s3-cdn";
import { safeStringifyValue } from "@/lib/utils/error-utils";
import { isS3Error, isS3NotFound } from "@/lib/utils/s3-error-guards";
import { getS3Client } from "./client";
import { assertNotDryRun, getS3Config } from "./config";
import { S3InvalidContentTypeError, S3NotFoundError, S3OperationError } from "./errors";
import { streamToBuffer } from "./stream";

const toErrorContext = (
  operation: string,
  key: string | undefined,
  error: unknown,
): S3ErrorContext => {
  if (isS3Error(error)) {
    return {
      operation,
      key,
      code: error.code ?? error.name,
      httpStatus: error.$metadata?.httpStatusCode,
    };
  }
  return { operation, key };
};

const toBuffer = async (body: unknown): Promise<Buffer> => {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof Readable) return streamToBuffer(body);

  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return Buffer.from(await body.arrayBuffer());
  }
  if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
    const response = new Response(body);
    return Buffer.from(await response.arrayBuffer());
  }

  throw new S3OperationError("Unsupported S3 response body type", { operation: "getObject" });
};

export async function getObject(key: string, options?: { range?: string }): Promise<S3ObjectData> {
  assertNotDryRun("getObject", key);
  const config = getS3Config();
  const client = getS3Client();

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Range: options?.range,
      }),
    );

    const body = await toBuffer(response.Body);
    return {
      body,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
      eTag: response.ETag,
      lastModified: response.LastModified,
    };
  } catch (error: unknown) {
    const context = toErrorContext("getObject", key, error);
    if (isS3NotFound(error)) {
      throw new S3NotFoundError(context, error);
    }
    const message = safeStringifyValue(error);
    throw new S3OperationError(`S3 getObject failed for ${key}: ${message}`, context, error);
  }
}

export async function putObject(
  key: string,
  data: Buffer | string | Readable,
  options?: {
    contentType?: string;
    acl?: "private" | "public-read" | "public-read-write" | "authenticated-read";
    ifNoneMatch?: "*";
  },
): Promise<{ eTag?: string }> {
  assertNotDryRun("putObject", key);
  const config = getS3Config();
  const client = getS3Client();

  try {
    const response = await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: data,
        ContentType: options?.contentType,
        ACL: options?.acl ?? "private",
        IfNoneMatch: options?.ifNoneMatch,
      }),
    );
    return { eTag: response.ETag };
  } catch (error: unknown) {
    const context = toErrorContext("putObject", key, error);
    const message = safeStringifyValue(error);
    throw new S3OperationError(`S3 putObject failed for ${key}: ${message}`, context, error);
  }
}

export async function headObject(key: string): Promise<S3ObjectMetadata> {
  assertNotDryRun("headObject", key);
  const config = getS3Config();
  const client = getS3Client();

  try {
    const response = await client.send(
      new HeadObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }),
    );
    return {
      eTag: response.ETag,
      lastModified: response.LastModified,
      contentLength: response.ContentLength,
      contentType: response.ContentType,
    };
  } catch (error: unknown) {
    const context = toErrorContext("headObject", key, error);
    if (isS3NotFound(error)) {
      throw new S3NotFoundError(context, error);
    }
    const message = safeStringifyValue(error);
    throw new S3OperationError(`S3 headObject failed for ${key}: ${message}`, context, error);
  }
}

export async function checkIfS3ObjectExists(key: string): Promise<boolean> {
  try {
    await headObject(key);
    return true;
  } catch (error: unknown) {
    if (error instanceof S3NotFoundError) return false;
    throw error;
  }
}

export async function getS3ObjectMetadata(key: string): Promise<S3ObjectMetadata> {
  return headObject(key);
}

export async function listS3Objects(prefix: string): Promise<string[]> {
  assertNotDryRun("listS3Objects", prefix);
  const config = getS3Config();
  const client = getS3Client();
  const keys: string[] = [];
  let continuationToken: string | undefined;

  try {
    do {
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: config.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      if (response.Contents) {
        for (const item of response.Contents) {
          if (item.Key) keys.push(item.Key);
        }
      }
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
    return keys;
  } catch (error: unknown) {
    const context = toErrorContext("listS3Objects", prefix, error);
    const message = safeStringifyValue(error);
    throw new S3OperationError(
      `S3 listObjects failed for prefix ${prefix}: ${message}`,
      context,
      error,
    );
  }
}

export async function deleteFromS3(key: string): Promise<void> {
  assertNotDryRun("deleteFromS3", key);
  const config = getS3Config();
  const client = getS3Client();

  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }),
    );
  } catch (error: unknown) {
    const context = toErrorContext("deleteFromS3", key, error);
    const message = safeStringifyValue(error);
    throw new S3OperationError(`S3 delete failed for ${key}: ${message}`, context, error);
  }
}

export function assertJsonContentType(key: string, contentType?: string): void {
  if (!contentType) return;
  if (contentType.includes("application/json") || contentType.startsWith("text/")) return;
  throw new S3InvalidContentTypeError(
    { operation: "getObject", key },
    "application/json or text/*",
    contentType,
  );
}
