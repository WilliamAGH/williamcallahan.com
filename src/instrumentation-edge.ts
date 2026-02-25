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

const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "proxy-authorization",
  "x-api-key",
]);

function redactSensitiveHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string | string[] | undefined> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      SENSITIVE_HEADER_NAMES.has(name.toLowerCase()) ? "[REDACTED]" : value,
    ]),
  );
}

function buildRedactedRequest(request: {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
}): { path: string; method: string; headers: Record<string, string | string[] | undefined> } {
  return {
    ...request,
    headers: redactSensitiveHeaders(request.headers),
  };
}

function resolveEdgeDsn(): string | null {
  const privateDsn = process.env.SENTRY_DSN?.trim();
  if (privateDsn && privateDsn.length > 0) {
    console.info("[EdgeInstrumentation] Using SENTRY_DSN for edge Sentry initialization.");
    return privateDsn;
  }

  const publicDsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
  if (publicDsn && publicDsn.length > 0) {
    console.warn(
      "[EdgeInstrumentation] SENTRY_DSN missing; falling back to NEXT_PUBLIC_SENTRY_DSN for edge Sentry initialization.",
    );
    return publicDsn;
  }

  console.error("[EdgeInstrumentation] No DSN found in SENTRY_DSN or NEXT_PUBLIC_SENTRY_DSN.");
  return null;
}

function resolveReleaseVersion(): string | undefined {
  const sentryRelease = process.env.SENTRY_RELEASE?.trim();
  if (sentryRelease && sentryRelease.length > 0) {
    console.info("[EdgeInstrumentation] Using SENTRY_RELEASE for edge Sentry release.");
    return sentryRelease;
  }

  const gitHash = process.env.NEXT_PUBLIC_GIT_HASH?.trim();
  if (gitHash && gitHash.length > 0) {
    console.warn(
      "[EdgeInstrumentation] SENTRY_RELEASE missing; falling back to NEXT_PUBLIC_GIT_HASH.",
    );
    return gitHash;
  }

  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION?.trim();
  if (appVersion && appVersion.length > 0) {
    console.warn(
      "[EdgeInstrumentation] SENTRY_RELEASE and NEXT_PUBLIC_GIT_HASH missing; falling back to NEXT_PUBLIC_APP_VERSION.",
    );
    return appVersion;
  }

  console.warn("[EdgeInstrumentation] No release metadata found for edge Sentry events.");
  return undefined;
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
  const redactedRequest = buildRedactedRequest(request);

  if (!sentryInitialized) {
    console.error(
      "[EdgeInstrumentation] Sentry SDK not initialized; logging edge request error to console.",
      error,
      { request: redactedRequest, context },
    );
    return;
  }

  if (typeof Sentry.captureRequestError === "function") {
    Sentry.captureRequestError(error, request, context);
    return;
  }

  Sentry.captureException(error, {
    extra: {
      request: redactedRequest,
      context,
    },
  });
}
