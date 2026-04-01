/**
 * Book Cover Proxy Route
 * @module app/api/books/cover/[id]
 * @description
 * Proxies book cover images from AudioBookShelf without exposing the API key
 * to the client. The API key is injected server-side from environment variables.
 *
 * Security fix for #339: AUDIOBOOKSHELF_API_KEY was previously embedded in
 * coverUrl query parameters, leaking the key to any client viewing book data.
 */

import { type NextRequest, NextResponse } from "next/server";
import { createErrorResponse } from "@/lib/utils/api-utils";
import { IMAGE_SECURITY_HEADERS } from "@/lib/validators/url";

const COVER_FETCH_TIMEOUT_MS = 15_000;
const CACHE_DURATION_SECONDS = 60 * 60 * 24 * 365; // 1 year — covers are static
const HTTP_NOT_FOUND = 404;
const HTTP_BAD_GATEWAY = 502;
const HTTP_GATEWAY_TIMEOUT = 504;

/**
 * GET /api/books/cover/[id]
 * Fetches a book cover from AudioBookShelf using server-side credentials.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const baseUrl = process.env.AUDIOBOOKSHELF_URL;
  const apiKey = process.env.AUDIOBOOKSHELF_API_KEY;

  if (!baseUrl || !apiKey) {
    return createErrorResponse("AudioBookShelf not configured", 503);
  }

  // Validate ID format: alphanumeric, hyphens, underscores only
  if (!/^[\w-]+$/.test(id)) {
    return createErrorResponse("Invalid book ID format", 400);
  }

  const upstreamUrl = `${baseUrl}/api/items/${id}/cover?token=${apiKey}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), COVER_FETCH_TIMEOUT_MS);

  try {
    const upstream = await fetch(upstreamUrl, {
      signal: controller.signal,
      headers: { Accept: "image/*" },
    });

    if (!upstream.ok || !upstream.body) {
      const status = upstream.status === HTTP_NOT_FOUND ? HTTP_NOT_FOUND : HTTP_BAD_GATEWAY;
      return new NextResponse(null, { status });
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": `public, max-age=${CACHE_DURATION_SECONDS}, immutable`,
        ...IMAGE_SECURITY_HEADERS,
      },
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    return new NextResponse(null, { status: isTimeout ? HTTP_GATEWAY_TIMEOUT : HTTP_BAD_GATEWAY });
  } finally {
    clearTimeout(timeoutId);
  }
}
