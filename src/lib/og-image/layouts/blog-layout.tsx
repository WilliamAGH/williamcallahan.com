/**
 * Blog Post OG Image Layout
 * @module lib/og-image/layouts/blog-layout
 * @description
 * Renders the OG image layout for blog post pages.
 * Cover image left, title/author right.
 */

import { truncateText } from "@/lib/utils";
import { OG_COLORS, OG_LAYOUT, OG_TYPOGRAPHY } from "../design-tokens";
import type { OgBlogLayoutProps } from "@/types/schemas/og-image";
import { renderBranding } from "./shared-branding";
import { renderPlaceholderCover } from "./shared-placeholder";

export function renderBlogLayout({ title, author, coverDataUrl }: OgBlogLayoutProps) {
  const displayTitle = truncateText(title, 60);
  const displayAuthor = author ? truncateText(author, 45) : "";

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
        {/* Cover image */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            width: OG_LAYOUT.coverWidth,
            flexShrink: 0,
          }}
        >
          {coverDataUrl ? (
            <img
              src={coverDataUrl}
              alt=""
              width={OG_LAYOUT.coverImageWidth}
              height={OG_LAYOUT.coverImageHeight}
              style={{
                width: OG_LAYOUT.coverImageWidth,
                height: OG_LAYOUT.coverImageHeight,
                objectFit: "cover",
                borderRadius: OG_LAYOUT.borderRadius,
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            />
          ) : (
            renderPlaceholderCover()
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
              fontSize: OG_TYPOGRAPHY.sectionLabel.size,
              fontWeight: OG_TYPOGRAPHY.sectionLabel.weight,
              color: OG_COLORS.accent,
              marginBottom: 20,
              textTransform: "uppercase",
              letterSpacing: OG_TYPOGRAPHY.sectionLabel.letterSpacing,
            }}
          >
            Blog
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

          {displayAuthor && (
            <div
              style={{
                display: "flex",
                fontSize: OG_TYPOGRAPHY.subtitle.size,
                fontWeight: OG_TYPOGRAPHY.subtitle.weight,
                color: OG_COLORS.textMuted,
                marginBottom: 24,
              }}
            >
              by {displayAuthor}
            </div>
          )}
        </div>
      </div>

      {renderBranding()}
    </div>
  );
}
