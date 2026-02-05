/**
 * Request Context for structured logging
 * Provides request ID generation and context propagation
 * @module lib/utils/request-context
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { RequestContext } from "@/types/lib";

// Use AsyncLocalStorage to maintain context across async boundaries
const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Generate a new request ID
 */
export function generateRequestId(): string {
  return randomUUID();
}

/**
 * Run a function with a request context
 */
export async function withRequestContext<T>(
  context: RequestContext,
  fn: () => Promise<T>,
): Promise<T> {
  return asyncLocalStorage.run(context, fn);
}

/**
 * Get the current request context
 */
export function getRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

/**
 * Add metadata to the current request context
 */
export function addContextMetadata(metadata: Record<string, unknown>): void {
  const context: RequestContext | undefined = asyncLocalStorage.getStore();
  if (context) {
    context.metadata = { ...context.metadata, ...metadata };
  }
}

/**
 * Create a structured log entry with request context
 */
export function createLogEntry(
  level: "info" | "warn" | "error",
  message: string,
  data?: Record<string, unknown>,
): Record<string, unknown> {
  const context: RequestContext | undefined = getRequestContext();
  const timestamp = new Date().toISOString();

  return {
    timestamp,
    level,
    message,
    ...(context?.requestId && {
      requestId: context.requestId,
      operation: context.operation,
      userId: context.userId,
    }),
    ...(data && { data }),
    ...(context?.metadata && { metadata: context.metadata }),
  };
}

/**
 * Log with request context
 */
export function logWithContext(
  level: "info" | "warn" | "error",
  message: string,
  data?: Record<string, unknown>,
): void {
  const entry = createLogEntry(level, message, data);

  // Use appropriate console method based on level
  const logMethod =
    level === "error" ? console.error : level === "warn" ? console.warn : console.log;

  if (process.env.NODE_ENV === "production") {
    // In production, log as JSON for better parsing
    logMethod(JSON.stringify(entry));
  } else {
    // In development, log in a more readable format
    const { timestamp, requestId, operation, ...rest } = entry;
    // Safely coerce potentially unknown values to string to satisfy @typescript-eslint/no-base-to-string
    const safeRequestId = typeof requestId === "string" ? requestId : undefined;
    const safeOperation = typeof operation === "string" ? operation : undefined;
    const prefix = `[${String(timestamp)}]${safeRequestId ? ` [${safeRequestId}]` : ""}${safeOperation ? ` [${safeOperation}]` : ""}`;
    logMethod(`${prefix} ${message}`, rest.data || "");
  }
}
