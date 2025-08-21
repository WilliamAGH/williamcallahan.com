/**
 * This endpoint proxies Sentry events from the client `tunnel` option to the Sentry ingest URL
 * It's used to avoid CORS issues when the client is running on a different origin
 *
 * @param {NextRequest} request - The incoming request object
 * @returns {NextResponse} The response object
 */

import { NextResponse, type NextRequest } from "next/server";

// This endpoint proxies Sentry events from the client `tunnel` option to the Sentry ingest URL
export async function POST(request: NextRequest) {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    return NextResponse.json({ error: "SENTRY_DSN is not configured" }, { status: 500 });
  }

  // Parse DSN to build the envelope endpoint
  let url: URL;
  let projectId: string;
  let ingestHost: string;
  let envelopeUrl: string;

  try {
    url = new URL(dsn);
    // DSN path is like "/<projectId>", so we extract the projectId
    projectId = url.pathname.replace(/^\//, "");
    ingestHost = url.host;
    envelopeUrl = `${url.protocol}//${ingestHost}/api/${projectId}/envelope/`;
  } catch (error) {
    console.error("Failed to parse SENTRY_DSN:", error);
    return NextResponse.json({ error: "Invalid SENTRY_DSN format" }, { status: 500 });
  }

  // Forward the raw request body to Sentry
  const body = await request.arrayBuffer();
  try {
    const upstreamResponse = await fetch(envelopeUrl, {
      method: "POST",
      headers: {
        "Content-Type": request.headers.get("Content-Type") || "application/x-sentry-envelope",
      },
      body,
    });

    // Mirror status and headers (omit length-restricted headers)
    const responseHeaders = new Headers();
    upstreamResponse.headers.forEach((value, key) => {
      if (key.toLowerCase() === "content-encoding" || key.toLowerCase() === "content-length") return;
      responseHeaders.set(key, value);
    });

    return new NextResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Failed to forward Sentry event:", error);
    return NextResponse.json({ error: "Failed to forward event" }, { status: 502 });
  }
}
