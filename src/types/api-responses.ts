import { apiErrorResponseSchema } from "@/types/schemas/api";

/**
 * Safely extract error message from an unknown error response
 * @param error - The error response (could be anything)
 * @param fallback - Fallback message if no message found
 * @returns The error message or fallback
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  const result = apiErrorResponseSchema.safeParse(error);
  if (!result.success) return fallback;
  if (result.data.message !== undefined) return result.data.message;
  if (result.data.error !== undefined) return result.data.error;
  return fallback;
}
