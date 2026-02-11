/**
 * Shared OG Image Placeholder
 * @module lib/og-image/layouts/shared-placeholder
 * @description
 * Renders placeholder cover/screenshot elements when no image is available.
 */

import { OG_COLORS, OG_LAYOUT } from "../design-tokens";

/** Renders a book-shaped placeholder with an SVG book icon */
export function renderPlaceholderCover() {
  return (
    <div
      style={{
        display: "flex",
        width: OG_LAYOUT.coverImageWidth,
        height: OG_LAYOUT.coverImageHeight,
        borderRadius: OG_LAYOUT.borderRadius,
        backgroundColor: OG_COLORS.backgroundAlt,
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
        stroke={OG_COLORS.textMuted}
        strokeWidth="1.5"
      >
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    </div>
  );
}

/** Renders a landscape-shaped placeholder with a generic image icon */
export function renderPlaceholderScreenshot() {
  return (
    <div
      style={{
        display: "flex",
        width: OG_LAYOUT.coverImageWidth,
        height: 240,
        borderRadius: OG_LAYOUT.borderRadius,
        backgroundColor: OG_COLORS.backgroundAlt,
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
      }}
    >
      <svg
        width="80"
        height="80"
        viewBox="0 0 24 24"
        fill="none"
        stroke={OG_COLORS.textMuted}
        strokeWidth="1.5"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    </div>
  );
}
