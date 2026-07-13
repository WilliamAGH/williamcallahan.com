/**
 * Next.js Instrumentation Hook
 *
 * This file is loaded once when the Next.js server starts.
 * It dynamically imports the appropriate instrumentation based on the runtime.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";

const SENSITIVE_REQUEST_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "proxy-authorization",
  "x-api-key",
  "x-refresh-secret",
]);

export async function register() {
  // Skip all instrumentation in development to reduce memory overhead
  if (process.env.NODE_ENV === "development") {
    return;
  }

  // Only run instrumentation in server/node runtime
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Dynamically import Node.js specific instrumentation
    const mod = await import("./instrumentation-node");
    await mod.register();
  } else if (process.env.NEXT_RUNTIME === "edge") {
    // Dynamically import Edge runtime specific instrumentation
    const mod = await import("./instrumentation-edge");
    await mod.register();
  }
}

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  Sentry.captureRequestError(
    error,
    {
      ...request,
      headers: Object.fromEntries(
        Object.entries(request.headers).map(([name, value]) => [
          name,
          SENSITIVE_REQUEST_HEADERS.has(name.toLowerCase()) ? "[REDACTED]" : value,
        ]),
      ),
    },
    context,
  );
};
