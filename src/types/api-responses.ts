/**
 * Type definitions for API response shapes
 * Used for type-safe error handling in API routes and client components
 */

/**
 * Standard error response shape from API endpoints
 * This matches what our APIs actually return
 */
export interface ApiErrorResponse {
  message?: string;
  error?: string;
  [key: string]: unknown; // Allow additional properties
}

/**
 * Type guard to check if an unknown value has a message property
 * @param value - The value to check
 * @returns True if the value has a message property
 */
export function hasMessage(value: unknown): value is { message: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof (value as Record<string, unknown>).message === "string"
  );
}

/**
 * Safely extract error message from an unknown error response
 * @param error - The error response (could be anything)
 * @param fallback - Fallback message if no message found
 * @returns The error message or fallback
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (hasMessage(error)) {
    return error.message;
  }
  return fallback;
}
