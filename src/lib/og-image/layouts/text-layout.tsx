/**
 * Text-Only OG Image Layout
 * @module lib/og-image/layouts/text-layout
 * @description
 * Renders the OG image layout for text-only pages (thoughts, collections, tag pages).
 * Large centered title with optional subtitle and section label.
 */

import { truncateText } from "@/lib/utils";
import { OG_COLORS, OG_LAYOUT, OG_TYPOGRAPHY } from "../design-tokens";
import type { OgTextParams } from "@/types/schemas/og-image";
import { renderBranding } from "./shared-branding";

export function renderTextLayout({ title, subtitle, section }: OgTextParams) {
  const displayTitle = truncateText(title, 80);
  const displaySubtitle = subtitle ? truncateText(subtitle, 120) : "";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: OG_COLORS.background,
        backgroundImage: `linear-gradient(135deg, ${OG_COLORS.background} 0%, ${OG_COLORS.backgroundAlt} 100%)`,
        fontFamily: "system-ui, sans-serif",
        padding: OG_LAYOUT.padding,
      }}
    >
      {/* Centered content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {section && (
          <div
            style={{
              display: "flex",
              fontSize: 22,
              fontWeight: 600,
              color: OG_COLORS.accent,
              marginBottom: 24,
              textTransform: "uppercase",
              letterSpacing: 3,
            }}
          >
            {section}
          </div>
        )}

        <div
          style={{
            display: "flex",
            fontSize: OG_TYPOGRAPHY.title.size,
            fontWeight: OG_TYPOGRAPHY.title.weight,
            color: OG_COLORS.text,
            lineHeight: OG_TYPOGRAPHY.title.lineHeight,
            textAlign: "center",
            maxWidth: 900,
          }}
        >
          {displayTitle}
        </div>

        {displaySubtitle && (
          <div
            style={{
              display: "flex",
              fontSize: OG_TYPOGRAPHY.subtitle.size,
              fontWeight: OG_TYPOGRAPHY.subtitle.weight,
              color: OG_COLORS.textMuted,
              marginTop: 24,
              textAlign: "center",
              maxWidth: 800,
            }}
          >
            {displaySubtitle}
          </div>
        )}
      </div>

      {renderBranding()}
    </div>
  );
}
