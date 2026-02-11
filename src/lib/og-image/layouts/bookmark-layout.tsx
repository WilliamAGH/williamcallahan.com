/**
 * Bookmark OG Image Layout
 * @module lib/og-image/layouts/bookmark-layout
 * @description
 * Renders the OG image layout for bookmark detail pages.
 * Screenshot left, title/domain right.
 */

import { truncateText } from "@/lib/utils";
import { OG_COLORS, OG_LAYOUT, OG_TYPOGRAPHY } from "../design-tokens";
import type { OgBookmarkLayoutProps } from "@/types/schemas/og-image";
import { renderBranding } from "./shared-branding";
import { renderPlaceholderScreenshot } from "./shared-placeholder";

export function renderBookmarkLayout({ title, domain, screenshotDataUrl }: OgBookmarkLayoutProps) {
  const displayTitle = truncateText(title, 70);

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
            width: OG_LAYOUT.coverWidth,
            flexShrink: 0,
          }}
        >
          {screenshotDataUrl ? (
            <img
              src={screenshotDataUrl}
              alt=""
              width={OG_LAYOUT.coverImageWidth}
              height={240}
              style={{
                width: OG_LAYOUT.coverImageWidth,
                height: 240,
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
            paddingLeft: OG_LAYOUT.contentGap,
            justifyContent: "flex-start",
          }}
        >
          {/* Section label */}
          <div
            style={{
              display: "flex",
              fontSize: 20,
              fontWeight: 600,
              color: OG_COLORS.accent,
              marginBottom: 16,
              textTransform: "uppercase",
              letterSpacing: 2,
            }}
          >
            Bookmark
          </div>

          <div
            style={{
              display: "flex",
              fontSize: OG_TYPOGRAPHY.title.size,
              fontWeight: OG_TYPOGRAPHY.title.weight,
              color: OG_COLORS.text,
              lineHeight: OG_TYPOGRAPHY.title.lineHeight,
              marginBottom: 20,
            }}
          >
            {displayTitle}
          </div>

          {domain && (
            <div
              style={{
                display: "flex",
                fontSize: OG_TYPOGRAPHY.subtitle.size,
                fontWeight: OG_TYPOGRAPHY.subtitle.weight,
                color: OG_COLORS.textMuted,
              }}
            >
              {domain}
            </div>
          )}
        </div>
      </div>

      {renderBranding()}
    </div>
  );
}
