import type { S3ErrorContext } from "@/types/s3-cdn";
import { safeStringifyValue } from "@/lib/utils/error-utils";

export class S3ConfigError extends Error {
  public readonly missingKeys: string[];

  constructor(missingKeys: string[]) {
    super(`Missing S3 configuration: ${missingKeys.join(", ")}`);
    this.name = "S3ConfigError";
    this.missingKeys = missingKeys;
  }
}

export class S3DryRunError extends Error {
  public readonly operation: string;
  public readonly key?: string;

  constructor(operation: string, key?: string) {
    super(`S3 operation blocked by DRY_RUN: ${operation}${key ? ` (${key})` : ""}`);
    this.name = "S3DryRunError";
    this.operation = operation;
    this.key = key;
  }
}

export class S3OperationError extends Error {
  public readonly operation: string;
  public readonly key?: string;
  public readonly code?: string;
  public readonly httpStatus?: number;
  public readonly cause?: unknown;

  constructor(message: string, context: S3ErrorContext, cause?: unknown) {
    super(message);
    this.name = "S3OperationError";
    this.operation = context.operation;
    this.key = context.key;
    this.code = context.code;
    this.httpStatus = context.httpStatus;
    this.cause = cause;
  }
}

export class S3NotFoundError extends S3OperationError {
  constructor(context: S3ErrorContext, cause?: unknown) {
    super(`S3 object not found${context.key ? `: ${context.key}` : ""}`, context, cause);
    this.name = "S3NotFoundError";
  }
}

export class S3JsonParseError extends S3OperationError {
  constructor(context: S3ErrorContext, rawError: unknown) {
    const message = `Failed to parse JSON for S3 key ${context.key ?? "unknown"}: ${safeStringifyValue(rawError)}`;
    super(message, context, rawError);
    this.name = "S3JsonParseError";
  }
}

export class S3InvalidContentTypeError extends S3OperationError {
  public readonly expected: string;
  public readonly received?: string;

  constructor(context: S3ErrorContext, expected: string, received?: string) {
    super(
      `Unexpected content type for ${context.key ?? "S3 object"}: expected ${expected}, received ${received ?? "unknown"}`,
      context,
    );
    this.name = "S3InvalidContentTypeError";
    this.expected = expected;
    this.received = received;
  }
}
