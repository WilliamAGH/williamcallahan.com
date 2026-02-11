/**
 * Project OG Image Layout
 * @module lib/og-image/layouts/project-layout
 * @description
 * Renders the OG image layout for project detail pages.
 * Screenshot left, title right.
 */

import { truncateText } from "@/lib/utils";
import { OG_COLORS, OG_LAYOUT, OG_TYPOGRAPHY } from "../design-tokens";
import type { OgProjectLayoutProps } from "@/types/schemas/og-image";
import { renderBranding } from "./shared-branding";
import { renderPlaceholderScreenshot } from "./shared-placeholder";

export function renderProjectLayout({ title, screenshotDataUrl }: OgProjectLayoutProps) {
  const displayTitle = truncateText(title, 36);

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
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          flex: 1,
          alignItems: "flex-start",
        }}
      >
        {/* Screenshot */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            width: OG_LAYOUT.screenshotColumnWidth,
            flexShrink: 0,
          }}
        >
          {screenshotDataUrl ? (
            <img
              src={screenshotDataUrl}
              alt=""
              width={OG_LAYOUT.screenshotImageWidth}
              height={OG_LAYOUT.screenshotImageHeight}
              style={{
                width: OG_LAYOUT.screenshotImageWidth,
                height: OG_LAYOUT.screenshotImageHeight,
                objectFit: "cover",
                borderRadius: OG_LAYOUT.borderRadius,
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            />
          ) : (
            renderPlaceholderScreenshot()
          )}
        </div>

        {/* Text content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            paddingLeft: OG_LAYOUT.screenshotContentGap,
            justifyContent: "flex-start",
          }}
        >
          {/* Section label */}
          <div
            style={{
              display: "flex",
              fontSize: OG_TYPOGRAPHY.sectionLabel.size,
              fontWeight: OG_TYPOGRAPHY.sectionLabel.weight,
              color: OG_COLORS.accent,
              marginBottom: 20,
              textTransform: "uppercase",
              letterSpacing: OG_TYPOGRAPHY.sectionLabel.letterSpacing,
            }}
          >
            Project
          </div>

          <div
            style={{
              display: "flex",
              fontSize: OG_TYPOGRAPHY.screenshotTitle.size,
              fontWeight: OG_TYPOGRAPHY.screenshotTitle.weight,
              color: OG_COLORS.text,
              lineHeight: OG_TYPOGRAPHY.screenshotTitle.lineHeight,
              marginBottom: 26,
            }}
          >
            {displayTitle}
          </div>
        </div>
      </div>

      {renderBranding()}
    </div>
  );
}
