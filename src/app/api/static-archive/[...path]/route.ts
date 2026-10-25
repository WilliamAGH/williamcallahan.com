/**
 * Static archive relay: answers a `/_next/static/chunks` request this replica's image cannot.
 *
 * A start-first rollout, or a replica of the other CPU architecture, can render a document whose
 * hashed chunks only another image holds. The web image build archives every chunk to the CDN
 * bucket before rollout (scripts/archive-static-assets.ts), and the `rewrites().fallback` in
 * next.config.ts routes a chunk the filesystem lacks here. Relaying through a handler instead of
 * an external rewrite keeps the visitor's cookies off the CDN request and keeps a missing chunk's
 * 404 uncacheable. docs/ops/deployment.md "Static asset archive" explains the design.
 *
 * @module app/api/static-archive
 */

import { NextResponse, connection, type NextRequest } from "next/server";
import { getS3CdnUrl } from "@/lib/utils/cdn-utils";
import logger from "@/lib/utils/logger";

// A stylesheet holds the page's first paint, so the archive gets one short total deadline.
const ARCHIVE_FETCH_TIMEOUT_MS = 10_000;
// The same header Next sends on a missing `/_next/static` file.
const NO_STORE_CACHE_CONTROL = "private, no-cache, no-store, max-age=0, must-revalidate";
// Next serves `/_next/static` with this header; an archived chunk keeps its hashed name.
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

function uncacheableResponse(status: number, message: string): NextResponse {
  return new NextResponse(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": NO_STORE_CACHE_CONTROL,
    },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  // connection(): ensure this handler stays request-time under cacheComponents
  await connection();
  const { path } = await params;
  const chunkPath = path.map(encodeURIComponent).join("/");
  const archiveUrl = `${getS3CdnUrl().replace(/\/+$/, "")}/_next/static/chunks/${chunkPath}`;

  let upstream: Response;
  try {
    upstream = await fetch(archiveUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(ARCHIVE_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    logger.error(`[static-archive] Fetching ${archiveUrl} failed`, error);
    return uncacheableResponse(503, "Static archive unavailable");
  }

  // The bucket answers 403 or 404 for an absent key.
  if (upstream.status === 403 || upstream.status === 404) {
    await upstream.body?.cancel();
    return uncacheableResponse(404, "Not Found");
  }
  const contentType = upstream.headers.get("content-type");
  if (!upstream.ok || !contentType) {
    await upstream.body?.cancel();
    logger.error(
      `[static-archive] ${archiveUrl} answered ${upstream.status} with content type ${contentType ?? "none"}`,
    );
    return uncacheableResponse(503, "Static archive unavailable");
  }
  return new NextResponse(upstream.body, {
    status: 200,
    headers: { "Content-Type": contentType, "Cache-Control": IMMUTABLE_CACHE_CONTROL },
  });
}
