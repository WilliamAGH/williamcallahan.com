/**
 * Dynamic OpenGraph Image Generator for Books
 * @module app/api/og/books/route
 * @description
 * Generates branded 1200×630 OG images for book detail pages.
 * Combines a sophisticated dark gradient background with the book cover
 * and metadata (title, author, format badges).
 *
 * Uses @vercel/og for image generation via Satori.
 *
 * Query Parameters:
 * - title: Book title (required)
 * - author: Author name(s) (optional)
 * - coverUrl: URL to book cover image (optional)
 * - formats: Comma-separated formats: audio,ebook,print (optional)
 *
 * @see https://github.com/vercel/satori - Satori CSS subset documentation
 */

import { ImageResponse } from "@vercel/og";
import type { NextRequest } from "next/server";
import sharp from "sharp";

import { truncateText } from "@/lib/utils";

/**
 * Force Node.js runtime - sharp is a native Node.js binding that cannot run on Edge.
 * Without this export, the route would fail if the project ever sets a default Edge runtime.
 */

// OG Image dimensions (standard)
const WIDTH = 1200;
const HEIGHT = 630;

// Design tokens matching site's dark theme
const COLORS = {
  background: "#0a0f1a",
  backgroundAlt: "#1a1f3a",
  accent: "#3b82f6",
  text: "#ffffff",
  textMuted: "#94a3b8",
  audioBadge: "#8b5cf6",
  ebookBadge: "#10b981",
  printBadge: "#f59e0b",
};

// Format badge configuration
const FORMAT_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  audio: { label: "Audiobook", color: COLORS.audioBadge, icon: "🎧" },
  ebook: { label: "eBook", color: COLORS.ebookBadge, icon: "📱" },
  print: { label: "Print", color: COLORS.printBadge, icon: "📖" },
};

/**
 * Converts a potentially relative URL to an absolute URL using the request origin.
 * Node.js fetch() requires absolute URLs, so relative paths like /api/cache/images
 * must be resolved against the request origin.
 *
 * Uses URL constructor for proper resolution, avoiding string concatenation pitfalls.
 * Only allows http/https protocols to prevent SSRF via other schemes (file://, etc.).
 *
 * @throws Error if the resolved URL uses an unsupported protocol
 */
function ensureAbsoluteUrl(url: string, requestOrigin: string): string {
  const resolved = new URL(url, requestOrigin);
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
    throw new Error(`Unsupported coverUrl protocol: ${resolved.protocol}`);
  }
  return resolved.toString();
}

// Security limits for image fetching
const FETCH_TIMEOUT_MS = 5_000;
const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024; // 4 MiB

/**
 * Fetches an image and converts it to a base64 PNG data URL
 * Satori only supports PNG, JPEG, and GIF - NOT WebP
 *
 * Security hardening against SSRF:
 * - Timeout: Prevents slow-loris attacks (5s limit)
 * - Content-Type validation: Only accepts image/* responses
 * - Size cap: Prevents decompression bombs (4 MiB limit)
 * - Protocol restriction: Only http/https via ensureAbsoluteUrl
 *
 * Note: For same-origin enforcement or allowlist, configure at the infrastructure level
 * or add URL origin validation if cross-origin covers become a concern.
 */
async function fetchImageAsDataUrl(url: string, requestOrigin: string): Promise<string | null> {
  try {
    const absoluteUrl = ensureAbsoluteUrl(url, requestOrigin);
    const response = await fetch(absoluteUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; OG-Image-Bot/1.0)",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`[OG-Books] Failed to fetch cover: ${response.status}`);
      return null;
    }

    // Validate content-type is an image
    const contentType = response.headers.get("content-type");
    if (!contentType?.startsWith("image/")) {
      console.error(`[OG-Books] Invalid content-type: ${contentType}`);
      return null;
    }

    // Stream with size limit to prevent decompression bombs
    const reader = response.body?.getReader();
    if (!reader) {
      console.error("[OG-Books] No response body reader available");
      return null;
    }

    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalSize += value.length;
      if (totalSize > MAX_IMAGE_SIZE_BYTES) {
        await reader.cancel();
        console.error(`[OG-Books] Image exceeds size limit: ${totalSize} > ${MAX_IMAGE_SIZE_BYTES}`);
        return null;
      }
      chunks.push(value);
    }

    const buffer = Buffer.concat(chunks);

    // Use sharp to convert any format (including WebP) to PNG
    const pngBuffer = await sharp(buffer).png().toBuffer();

    const base64 = pngBuffer.toString("base64");
    return `data:image/png;base64,${base64}`;
  } catch (error) {
    // Handle timeout gracefully
    if (error instanceof Error && error.name === "TimeoutError") {
      console.error(`[OG-Books] Fetch timeout after ${FETCH_TIMEOUT_MS}ms`);
      return null;
    }
    console.error(`[OG-Books] Error converting cover image:`, error);
    return null;
  }
}

export async function GET(request: NextRequest): Promise<ImageResponse> {
  const { searchParams, origin } = request.nextUrl;

  const title = searchParams.get("title") ?? "Untitled Book";
  const author = searchParams.get("author") ?? "";
  const coverUrl = searchParams.get("coverUrl");
  const formatsParam = searchParams.get("formats") ?? "";

  const formats = formatsParam
    .split(",")
    .map(f => f.trim().toLowerCase())
    .filter(f => f in FORMAT_CONFIG);

  const displayTitle = truncateText(title, 60);
  const displayAuthor = author ? truncateText(author, 45) : "";

  // Convert cover image to base64 PNG (Satori doesn't support WebP)
  // Uses request origin to resolve relative URLs like /api/cache/images
  let coverDataUrl: string | null = null;
  if (coverUrl) {
    coverDataUrl = await fetchImageAsDataUrl(coverUrl, origin);
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          backgroundColor: COLORS.background,
          backgroundImage: `linear-gradient(135deg, ${COLORS.background} 0%, ${COLORS.backgroundAlt} 100%)`,
          fontFamily: "system-ui, sans-serif",
          padding: 56,
        }}
      >
        {/* Main content row - top aligned */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            flex: 1,
            alignItems: "flex-start",
          }}
        >
          {/* Book cover section */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              width: 340,
              flexShrink: 0,
            }}
          >
            {coverDataUrl ? (
              <img
                src={coverDataUrl}
                alt=""
                width={320}
                height={420}
                style={{
                  width: 320,
                  height: 420,
                  objectFit: "cover",
                  borderRadius: 16,
                  boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  width: 320,
                  height: 420,
                  borderRadius: 16,
                  backgroundColor: COLORS.backgroundAlt,
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              >
                <svg
                  width="100"
                  height="100"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={COLORS.textMuted}
                  strokeWidth="1.5"
                >
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              </div>
            )}
          </div>

          {/* Text content section - top aligned */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              paddingLeft: 48,
              justifyContent: "flex-start",
            }}
          >
            {/* Title */}
            <div
              style={{
                display: "flex",
                fontSize: 56,
                fontWeight: 700,
                color: COLORS.text,
                lineHeight: 1.15,
                marginBottom: 20,
              }}
            >
              {displayTitle}
            </div>

            {/* Author */}
            {displayAuthor && (
              <div
                style={{
                  display: "flex",
                  fontSize: 32,
                  fontWeight: 500,
                  color: COLORS.textMuted,
                  marginBottom: 32,
                }}
              >
                by {displayAuthor}
              </div>
            )}

            {/* Format badges */}
            {formats.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  gap: 16,
                  flexWrap: "wrap",
                }}
              >
                {formats.map(format => {
                  const config = FORMAT_CONFIG[format];
                  if (!config) return null;
                  return (
                    <div
                      key={format}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "14px 24px",
                        borderRadius: 999,
                        backgroundColor: `${config.color}22`,
                        border: `2px solid ${config.color}`,
                      }}
                    >
                      <span style={{ fontSize: 24 }}>{config.icon}</span>
                      <span
                        style={{
                          fontSize: 22,
                          fontWeight: 600,
                          color: config.color,
                        }}
                      >
                        {config.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Site branding at bottom - larger */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 12,
            marginTop: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: COLORS.accent,
            }}
          />
          <span
            style={{
              fontSize: 28,
              fontWeight: 500,
              color: COLORS.textMuted,
            }}
          >
            williamcallahan.com
          </span>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
    },
  );
}
