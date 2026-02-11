/**
 * OG Image Design Tokens
 * @module lib/og-image/design-tokens
 * @description
 * Shared visual constants for all OG image layouts.
 * Single source of truth for colors, typography, and layout dimensions.
 */

/** Brand color palette for OG images (dark theme) */
export const OG_COLORS = {
  background: "#0a0f1a",
  backgroundAlt: "#1a1f3a",
  accent: "#3b82f6",
  text: "#ffffff",
  textMuted: "#94a3b8",
} as const;

/** Standard OG image canvas dimensions and spacing */
export const OG_LAYOUT = {
  width: 1200,
  height: 630,
  padding: 56,
  coverWidth: 440,
  coverImageWidth: 420,
  coverImageHeight: 500,
  screenshotColumnWidth: 580,
  screenshotImageWidth: 560,
  screenshotImageHeight: 400,
  screenshotContentGap: 24,
  contentGap: 48,
  borderRadius: 16,
} as const;

/** Typography scale for OG images */
export const OG_TYPOGRAPHY = {
  title: { size: 56, weight: 700, lineHeight: 1.15 },
  subtitle: { size: 32, weight: 500 },
  sectionLabel: { size: 26, weight: 600, letterSpacing: 3 },
  screenshotTitle: { size: 68, weight: 700, lineHeight: 1.08 },
  screenshotSubtitle: { size: 42, weight: 500 },
  branding: { size: 28, weight: 500 },
} as const;
