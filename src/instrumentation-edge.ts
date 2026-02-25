/*
 * Edge-runtime shim for instrumentation.
 * This file MUST NOT reference any Node-only APIs. Next.js automatically picks
 * `instrumentation.edge.ts` for the Edge compiler and `instrumentation.ts`
 * (runtime = "nodejs") for the Node.js compiler, so separating concerns keeps
 * both bundles clean.
 */

import * as Sentry from "@sentry/nextjs";

export const runtime = "edge" as const;

const EDGE_TRACES_SAMPLE_RATE = 0.25;

let sentryInitialized = false;
let hasLoggedMissingDsn = false;

function resolveEdgeDsn(): string | null {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn || dsn.trim().length === 0) {
    return null;
  }
  return dsn;
}

function resolveReleaseVersion(): string | undefined {
  return (
    process.env.SENTRY_RELEASE ||
    process.env.NEXT_PUBLIC_GIT_HASH ||
    process.env.NEXT_PUBLIC_APP_VERSION
  );
}

/*
 * register(): initialize the Sentry Edge SDK when an Edge runtime is active.
 * The capture hook uses `Sentry.captureRequestError` per @sentry/nextjs contract.
 *
 * @see node_modules/@sentry/nextjs/build/types/common/captureRequestError.d.ts
 */
export async function register(): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  if (sentryInitialized) {
    return;
  }

  const dsn = resolveEdgeDsn();
  if (!dsn) {
    if (!hasLoggedMissingDsn) {
      hasLoggedMissingDsn = true;
      console.error(
        "[EdgeInstrumentation] Missing SENTRY_DSN/NEXT_PUBLIC_SENTRY_DSN; edge errors cannot be sent to Sentry.",
      );
    }
    return;
  }

  Sentry.init({
    dsn,
    release: resolveReleaseVersion(),
    tracesSampleRate: EDGE_TRACES_SAMPLE_RATE,
  });

  sentryInitialized = true;
}

/*
 * onRequestError(): capture request-scoped errors in Edge runtime.
 */
export function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routerKind: string; routePath: string; routeType: string },
): void {
  if (typeof Sentry.captureRequestError === "function") {
    Sentry.captureRequestError(error, request, context);
    return;
  }

  Sentry.captureException(error, {
    extra: {
      request,
      context,
    },
  });
}
