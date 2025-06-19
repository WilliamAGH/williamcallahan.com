/**
 * Error Utilities
 *
 * SCOPE: Runtime utility functions and type guards for error handling.
 */
import type { ExtendedError, ErrorWithCode, ErrorWithStatusCode } from "@/types/error";

/**
 * Type guard to check if an error is an object with a 'code' property.
 */
export function isErrorWithCode(error: unknown): error is ErrorWithCode {
  return typeof error === "object" && error !== null && "code" in error;
}

/**
 * Type guard to check if an error is an object with a 'statusCode' property.
 */
export function isErrorWithStatusCode(error: unknown): error is ErrorWithStatusCode {
  return typeof error === "object" && error !== null && "statusCode" in error;
}

/**
 * Safely gets a property from an error object if it exists.
 */
export function getProperty(error: ExtendedError, property: string): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    property in error &&
    typeof (error as unknown as Record<string, unknown>)[property] === "number"
  ) {
    return (error as unknown as Record<string, number>)[property];
  }
  return undefined;
}
