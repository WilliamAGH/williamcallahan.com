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
 * - title: Book title (optional, defaults to "Untitled Book")
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
import { isPrivateIP } from "@/types/schemas/url";

/**
 * DO NOT ADD `export const runtime = "nodejs"` HERE - DO NOT REMOVE THIS COMMENT
 *
 * Next.js 16 guarantees Node.js runtime for all app/api/* routes by default.
 * Sharp's native bindings work correctly without an explicit runtime export.
 * Adding the runtime export breaks this project's build pipeline (tested empirically).
 *
 * This is documented behavior: Next.js 16 defaults API routes to Node.js runtime,
 * making explicit runtime declarations unnecessary and potentially problematic.
 *
 * @see docs/projects/structure/next-js-16-usage.md for framework runtime guarantees
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
const FORMAT_CONFIG = {
  audio: { label: "Audiobook", color: COLORS.audioBadge, icon: "🎧" },
  ebook: { label: "eBook", color: COLORS.ebookBadge, icon: "📱" },
  print: { label: "Print", color: COLORS.printBadge, icon: "📖" },
} as const satisfies Record<string, { label: string; color: string; icon: string }>;

/**
 * Type guard to check if a value is a valid format key.
 * Uses Object.hasOwn() instead of `in` operator to prevent prototype pollution
 * (e.g., "toString" would pass `in` check but fail hasOwn).
 */
function isFormatKey(value: string): value is keyof typeof FORMAT_CONFIG {
  return Object.hasOwn(FORMAT_CONFIG, value);
}

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
/**
 * Hosts that are blocked to prevent SSRF attacks.
 * Includes localhost variants and common cloud metadata endpoints.
 */
const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "169.254.169.254", // AWS/GCP/Azure instance metadata
  "metadata.google.internal", // GCP metadata
]);

/**
 * Check if a hostname falls within private/internal IP ranges.
 * Returns true if the host should be blocked.
 */
function isPrivateHost(hostname: string): boolean {
  const normalizedHost = hostname.toLowerCase();
  const bracketStrippedHost = normalizedHost.replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTS.has(normalizedHost) || BLOCKED_HOSTS.has(bracketStrippedHost)) {
    return true;
  }

  // Shared helper covers IPv4, IPv6, and IPv6-mapped IPv4 (e.g., ::ffff:127.0.0.1)
  return isPrivateIP(bracketStrippedHost);
}

function ensureAbsoluteUrl(url: string, requestOrigin: string): string {
  const resolved = new URL(url, requestOrigin);
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
    throw new Error(`Unsupported coverUrl protocol: ${resolved.protocol}`);
  }

  // Allow same-origin requests (e.g., /api/cache/images resolved against localhost:3000)
  // These are safe because we're calling our own server
  const isSameOrigin = resolved.origin === requestOrigin;

  // SSRF protection: block internal/private hosts for cross-origin requests
  if (!isSameOrigin && isPrivateHost(resolved.hostname)) {
    throw new Error(`Blocked coverUrl host: ${resolved.hostname}`);
  }

  return resolved.toString();
}

// Security limits for image fetching
const FETCH_TIMEOUT_MS = 5_000;
const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024; // 4 MiB
const MAX_INPUT_PIXELS = 40_000_000; // 40 megapixels - guards against decompression bombs

/**
 * Fetches an image and converts it to a base64 PNG data URL
 * Satori only supports PNG, JPEG, and GIF - NOT WebP
 *
 * Security hardening against SSRF:
 * - Timeout: Prevents slow-loris attacks (5s limit)
 * - Content-Type validation: Only accepts image/* responses
 * - Size cap: Prevents large file downloads (4 MiB streaming limit)
 * - Pixel cap: Prevents decompression bombs via sharp limitInputPixels
 * - Protocol restriction: Only http/https via ensureAbsoluteUrl
 * - Host validation: Blocks private/internal IPs via isPrivateHost
 *
 * Defense-in-depth notes:
 * - DNS-to-private bypass: The isPrivateHost check validates hostnames, not resolved IPs.
 *   A malicious domain resolving to internal IPs could bypass this check. This is mitigated
 *   by infrastructure-level egress rules (Vercel/Cloudflare network restrictions) that prevent
 *   serverless functions from reaching private IP ranges regardless of DNS resolution.
 * - For additional hardening in untrusted environments, consider DNS resolution validation
 *   or a strict allowlist of approved cover image domains.
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
    // limitInputPixels guards against decompression bombs (small file, huge pixel dimensions)
    const pngBuffer = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).png().toBuffer();

    const base64 = pngBuffer.toString("base64");
    return `data:image/png;base64,${base64}`;
  } catch (error) {
    // Handle timeout/abort gracefully (name varies by runtime/undici version)
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      console.error(`[OG-Books] Fetch aborted/timeout after ${FETCH_TIMEOUT_MS}ms`);
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
    .map((f): string => f.trim().toLowerCase())
    .filter(isFormatKey);

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
