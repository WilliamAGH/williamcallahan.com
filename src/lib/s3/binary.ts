/**
 * S3 Binary Operations
 *
 * Binary read/write helpers with strict error behavior.
 *
 * @module lib/s3/binary
 */

import { Readable } from "node:stream";
import { isTextContentType } from "@/lib/utils/content-type";
import { safeStringifyValue } from "@/lib/utils/error-utils";
import { S3InvalidContentTypeError, S3NotFoundError, S3OperationError } from "./errors";
import { getObject, putObject } from "./objects";
import { streamToBuffer } from "./stream";

export async function readBinaryS3(s3Key: string): Promise<Buffer> {
  try {
    const { body, contentType } = await getObject(s3Key);
    if (
      contentType &&
      (isTextContentType(contentType) || contentType.includes("application/json"))
    ) {
      throw new S3InvalidContentTypeError(
        { operation: "readBinaryS3", key: s3Key },
        "binary content",
        contentType,
      );
    }
    return body;
  } catch (error: unknown) {
    if (error instanceof S3NotFoundError) throw error;
    if (error instanceof S3InvalidContentTypeError) throw error;
    if (error instanceof S3OperationError) throw error;
    const message = safeStringifyValue(error);
    throw new S3OperationError(
      `S3 binary read failed for ${s3Key}: ${message}`,
      { operation: "readBinaryS3", key: s3Key },
      error,
    );
  }
}

export async function readBinaryS3Optional(s3Key: string): Promise<Buffer | null> {
  try {
    return await readBinaryS3(s3Key);
  } catch (error: unknown) {
    if (error instanceof S3NotFoundError) return null;
    throw error;
  }
}

export async function writeBinaryS3(
  s3Key: string,
  data: Buffer | Readable,
  contentType: string,
): Promise<void> {
  let payload: Buffer | Readable = data;

  if (!Buffer.isBuffer(payload)) {
    try {
      const { Readable: ReadableStream } = await import("node:stream");
      if (
        payload instanceof ReadableStream ||
        (typeof payload === "object" && payload && "pipe" in payload)
      ) {
        payload = await streamToBuffer(payload as Readable);
      }
    } catch (error) {
      throw new S3OperationError(
        `Failed to convert stream to buffer for ${s3Key}: ${safeStringifyValue(error)}`,
        { operation: "writeBinaryS3", key: s3Key },
        error,
      );
    }
  }

  await putObject(s3Key, payload, {
    contentType,
    acl: "public-read",
  });
}
