/*
 * Edge-runtime shim for instrumentation.
 * This file MUST NOT reference any Node-only APIs. Next.js automatically picks
 * `instrumentation.edge.ts` for the Edge compiler and `instrumentation.ts`
 * (runtime = "nodejs") for the Node.js compiler, so separating concerns keeps
 * both bundles clean.
 */

export const runtime = "edge" as const;

/*
 * register(): optional hook invoked by Next.js during initialisation.  In the
 * Edge worker we currently don't need heavy diagnostics, so this is a no-op.
 * Leaving it defined maintains a consistent import surface across runtimes.
 */
export async function register(): Promise<void> {
  // No-op – add lightweight Edge instrumentation here if needed.
}

/*
 * onRequestError(): helper that the app can call to log unexpected failures.
 * We just write to console because third-party loggers like Sentry are loaded
 * only in the Node environment.
 */
export function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routerKind: string; routePath: string; routeType: string },
): void {
  // Edge workers have restricted global scope – fallback to simple logging.
  console.error("[EdgeInstrumentation] Request error:", error, { request, context });
}
