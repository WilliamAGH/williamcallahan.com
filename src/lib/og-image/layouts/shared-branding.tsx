/**
 * Shared OG Image Branding Footer
 * @module lib/og-image/layouts/shared-branding
 * @description
 * Renders the "● williamcallahan.com" branding footer used across all OG image layouts.
 */

import { OG_COLORS, OG_TYPOGRAPHY } from "../design-tokens";

/** Renders the site branding footer element for OG images */
export function renderBranding() {
  return (
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
          width: OG_TYPOGRAPHY.brandDot.size,
          height: OG_TYPOGRAPHY.brandDot.size,
          borderRadius: OG_TYPOGRAPHY.brandDot.size / 2,
          backgroundColor: OG_COLORS.accent,
        }}
      />
      <span
        style={{
          fontSize: OG_TYPOGRAPHY.branding.size,
          fontWeight: OG_TYPOGRAPHY.branding.weight,
          color: OG_COLORS.textMuted,
        }}
      >
        williamcallahan.com
      </span>
    </div>
  );
}
