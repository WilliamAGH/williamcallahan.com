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

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

/**
 * Fetches an image and converts it to a base64 PNG data URL
 * Satori only supports PNG, JPEG, and GIF - NOT WebP
 */
async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; OG-Image-Bot/1.0)",
      },
    });

    if (!response.ok) {
      console.error(`[OG-Books] Failed to fetch cover: ${response.status}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Use sharp to convert any format (including WebP) to PNG
    const pngBuffer = await sharp(buffer).png().toBuffer();

    const base64 = pngBuffer.toString("base64");
    return `data:image/png;base64,${base64}`;
  } catch (error) {
    console.error(`[OG-Books] Error converting cover image:`, error);
    return null;
  }
}

export async function GET(request: NextRequest): Promise<ImageResponse> {
  const { searchParams } = request.nextUrl;

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
  let coverDataUrl: string | null = null;
  if (coverUrl) {
    coverDataUrl = await fetchImageAsDataUrl(coverUrl);
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
