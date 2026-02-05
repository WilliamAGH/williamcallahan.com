/**
 * Next.js Instrumentation Hook
 *
 * This file is loaded once when the Next.js server starts.
 * It dynamically imports the appropriate instrumentation based on the runtime.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

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

export async function onRequestError(
  error: unknown,
  request: RequestInfo,
  context: Record<string, unknown>,
): Promise<void> {
  function normalizeRequest(req: RequestInfo): {
    path: string;
    method: string;
    headers: Record<string, string | string[] | undefined>;
  } {
    if (typeof req === "string") return { path: req, method: "GET", headers: {} };
    if (req instanceof Request) {
      return {
        path: new URL(req.url).pathname,
        method: req.method,
        headers: Object.fromEntries(req.headers.entries()),
      };
    }
    return { path: "unknown", method: "GET", headers: {} };
  }

  const safeRequest = normalizeRequest(request);
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const mod = await import("./instrumentation-node");
    mod.onRequestError?.(error, safeRequest, context);
  } else if (process.env.NEXT_RUNTIME === "edge") {
    const mod = await import("./instrumentation-edge");
    mod.onRequestError?.(
      error,
      safeRequest,
      context as {
        routerKind: string;
        routePath: string;
        routeType: string;
      },
    );
  }
}
