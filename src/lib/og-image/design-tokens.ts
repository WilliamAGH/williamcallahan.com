/**
 * OG Image Design Tokens
 * @module lib/og-image/design-tokens
 * @description
 * Shared visual constants for all OG image layouts.
 * Single source of truth for colors, typography, layout dimensions, and badge configs.
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
  coverWidth: 340,
  coverImageWidth: 320,
  coverImageHeight: 420,
  contentGap: 48,
  borderRadius: 16,
  badgeRadius: 999,
  badgeGap: 16,
} as const;

/** Typography scale for OG images */
export const OG_TYPOGRAPHY = {
  title: { size: 56, weight: 700, lineHeight: 1.15 },
  subtitle: { size: 32, weight: 500 },
  badge: { size: 22, weight: 600 },
  badgeIcon: { size: 24 },
  branding: { size: 28, weight: 500 },
  brandDot: { size: 12 },
} as const;

/** Book format badge configuration */
export const BOOK_FORMAT_CONFIG = {
  audio: { label: "Audiobook", color: "#8b5cf6", icon: "🎧" },
  ebook: { label: "eBook", color: "#10b981", icon: "📱" },
  print: { label: "Print", color: "#f59e0b", icon: "📖" },
} as const satisfies Record<string, { label: string; color: string; icon: string }>;

/** Generic tag badge colors (for blog, project, bookmark tags) */
export const TAG_BADGE_COLORS = [
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#06b6d4", // cyan
] as const;

/**
 * Type guard for valid book format keys.
 * Uses Object.hasOwn() to prevent prototype pollution.
 */
export function isBookFormatKey(value: string): value is keyof typeof BOOK_FORMAT_CONFIG {
  return Object.hasOwn(BOOK_FORMAT_CONFIG, value);
}
