/**
 * @file S3 Error Type Guards
 * @module lib/utils/s3-error-guards
 *
 * Type guards for S3 error detection. These enable type-safe error handling
 * when working with AWS SDK S3 operations.
 */

import type { S3Error } from "@/types/lib";

// Re-export the type for consumers that need it
export type { S3Error };

/**
 * Type guard to check if an error is an S3 error with metadata.
 *
 * @param error - The error to check
 * @returns True if the error has S3 error shape with $metadata
 */
export function isS3Error(error: unknown): error is S3Error {
  return typeof error === "object" && error !== null && "$metadata" in error;
}

/**
 * Check if an error is an S3 404 Not Found error.
 *
 * @param error - The error to check
 * @returns True if the error is an S3 404 error
 */
export function isS3NotFound(error: unknown): boolean {
  return isS3Error(error) && error.$metadata?.httpStatusCode === 404;
}
