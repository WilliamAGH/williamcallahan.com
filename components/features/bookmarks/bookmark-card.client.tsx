/**
 * Bookmark Card Client Component
 * @module components/features/bookmarks/bookmark-card.client
 * @description
 * Client component that handles the display of individual bookmark entries.
 * Integrates with the site's logo fetching system and supports dark mode.
 *
 * @example
 * ```tsx
 * <BookmarkCardClient
 *   id="1"
 *   url="https://example.com"
 *   title="Example Title"
 *   description="Example description"
 *   tags={["tag1", "tag2"]}
 *   dateBookmarked="2024-03-20T08:00:00Z"
 *   isDarkTheme={true}
 * />
 * ```
 */

"use client";

import { formatTagDisplay, normalizeTagsToStrings, tagToSlug } from "@/lib/utils/tag-utils";
import { cn, formatDate as utilFormatDate } from "@/lib/utils";
import { Calendar, ExternalLink as LucideExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { type JSX, useEffect, useState } from "react";
import { normalizeDomain } from "../../../lib/utils/domain-utils";
import { ExternalLink } from "../../ui/external-link.client";
import { ShareButton } from "./share-button.client";
import { getAssetUrl } from "@/lib/bookmarks/bookmark-helpers";
import { usePathname } from "next/navigation";
import { OptimizedCardImage } from "@/components/ui/logo-image.client";

import type { BookmarkCardClientProps } from "@/types";

/**
 * Bookmark Card Client Component
 * @param {BookmarkCardClientProps} props - Component properties
 * @returns {JSX.Element} Rendered bookmark card
 *
 * @remarks
 * This component is responsible for:
 * - Displaying bookmark information (title, description, dates)
 * - Showing website logos using the site's logo fetching system
 * - Rendering tags with consistent styling
 * - Supporting dark mode
 * - Handling external links
 */

export function BookmarkCardClient(props: BookmarkCardClientProps): JSX.Element | null {
  const { id, url, title, description, tags, ogImage, content, dateBookmarked, internalHref } = props;
  const pathname = usePathname();

  /**
   * Determine the correct link target for the image & title
   *
   * Rationale:
   * - On list/grid views we want to link to the internal bookmark detail page (`internalHref`)
   * - When the same component is rendered **inside** that detail page the internal link would be
   *   self-referential; in that context we instead fall back to the external `url` so users can still
   *   navigate to the original source
   */
  const effectiveInternalHref = internalHref && pathname !== internalHref ? internalHref : undefined;
  const [mounted, setMounted] = useState(false);

  // Effects for handling client-side initialization
  useEffect(() => {
    setMounted(true);
  }, []);

  // Define the date variables but only format them when mounted to avoid hydration mismatches
  const displayBookmarkDate = dateBookmarked;
  const displayPublishDate = null;

  // Use stable date formatting to avoid hydration issues
  const formattedBookmarkDate = displayBookmarkDate ? utilFormatDate(displayBookmarkDate) : "";
  const formattedPublishDate = displayPublishDate ? utilFormatDate(displayPublishDate) : null;

  // Handle image sources with multiple fallbacks
  // CRITICAL: Always prefer direct S3 CDN URLs to avoid proxy overhead
  // Only use proxy routes (/api/assets/, /api/og-image) as absolute last resort
  const getDisplayImageUrl = () => {
    const s3CdnUrl = process.env.NEXT_PUBLIC_S3_CDN_URL || "";

    // PRIORITY 1: Enriched ogImage field (already persisted to S3)
    // This is the MOST IMPORTANT - it contains the S3 URL from enrichment
    if (ogImage?.includes(s3CdnUrl)) {
      console.log(`[BookmarkCard] ✅ Using DIRECT S3 CDN from ogImage: ${ogImage}`);
      return ogImage;
    }

    // PRIORITY 2: Direct S3 CDN URLs in content.imageUrl
    if (content?.imageUrl?.includes(s3CdnUrl)) {
      console.log(`[BookmarkCard] ✅ Using DIRECT S3 CDN from imageUrl: ${content.imageUrl}`);
      return content.imageUrl;
    }

    // PRIORITY 3: Check if ogImage is a direct HTTP URL (not a proxy)
    if (ogImage?.startsWith("http")) {
      // If it's already a direct URL, use it (might be from older enrichments)
      console.log(`[BookmarkCard] Using direct HTTP ogImage: ${ogImage}`);
      return ogImage;
    }

    // PRIORITY 4: Direct HTTP URLs in content.imageUrl
    if (content?.imageUrl?.startsWith("http")) {
      console.log(`[BookmarkCard] Using direct HTTP imageUrl: ${content.imageUrl}`);
      return content.imageUrl;
    }

    // === PROXY FALLBACKS (only if no direct URLs available) ===

    // PRIORITY 5: Karakeep imageAssetId - unfortunately requires proxy
    if (content?.imageAssetId) {
      console.log(`[BookmarkCard] ⚠️ FALLBACK to proxy for Karakeep asset: ${content.imageAssetId}`);
      return getAssetUrl(content.imageAssetId);
    }

    // PRIORITY 6: OpenGraph proxy - only for truly external images
    if (ogImage && !ogImage.startsWith("/")) {
      console.log(`[BookmarkCard] ⚠️ FALLBACK to og-image proxy: ${ogImage}`);
      return `/api/og-image?url=${encodeURIComponent(ogImage)}&bookmarkId=${encodeURIComponent(id)}`;
    }

    // PRIORITY 7: Screenshot fallback - requires proxy
    if (content?.screenshotAssetId) {
      console.log(`[BookmarkCard] ⚠️ FALLBACK to proxy for screenshot: ${content.screenshotAssetId}`);
      return getAssetUrl(content.screenshotAssetId);
    }

    return null;
  };

  const displayImageUrl = getDisplayImageUrl();

  const domain = normalizeDomain(url);
  const domainWithoutWWW = domain.replace(/^www\./, "");

  // Process tags using shared utilities for consistency
  const rawTags = normalizeTagsToStrings(tags || []);

  // Truncate title to max 10 words
  const maxTitleWords = 10;
  const titleWords = title.split(" ");
  const displayTitle = titleWords.length > maxTitleWords ? `${titleWords.slice(0, maxTitleWords).join(" ")}...` : title;

  // Don't use a placeholder for SSR - render full card without interactive elements
  // Server will render as much as possible for SEO, client will hydrate

  if (!id || !url) return null;

  return (
    <div
      className={cn(
        "relative flex flex-col bg-white/50 dark:bg-gray-800/50 backdrop-blur-lg ring-0 rounded-3xl overflow-hidden shadow-xl hover:shadow-2xl transform transition-all duration-200",
        mounted && "hover:scale-[1.005]",
      )}
    >
      {/* Image Section with domain overlay */}
      <div className="relative w-full aspect-video overflow-hidden rounded-t-3xl bg-gray-100 dark:bg-gray-800">
        {/* Image background - clickable link */}
        {effectiveInternalHref ? (
          // When on list/grid views, link to internal bookmark page
          <Link href={effectiveInternalHref} title={title} className="absolute inset-0 block">
            <div className="relative w-full h-full">
              {/* Try unified OG image API first, but fall back to logo if image fails to load */}
              <OptimizedCardImage src={displayImageUrl ?? null} alt={title} logoDomain={domain} />
            </div>
          </Link>
        ) : (
          // When on individual bookmark page, link to external URL in new tab
          <ExternalLink href={url} title={title} showIcon={false} className="absolute inset-0 block">
            <div className="relative w-full h-full">
              {/* Try unified OG image API first, but fall back to logo if image fails to load */}
              <OptimizedCardImage src={displayImageUrl ?? null} alt={title} logoDomain={domain} />
            </div>
          </ExternalLink>
        )}
        {/* Clickable domain overlay - links to external URL */}
        <ExternalLink
          href={url}
          title={`Visit ${domainWithoutWWW}`}
          showIcon={false}
          className="absolute bottom-3 left-3 bg-white/80 dark:bg-gray-800/80 px-3 py-1 flex items-center space-x-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors z-10"
        >
          <LucideExternalLinkIcon className="w-4 h-4 text-gray-700 dark:text-gray-200" />
          <span className="text-sm text-gray-700 dark:text-gray-200">{domainWithoutWWW}</span>
        </ExternalLink>
      </div>
      {/* Content Section */}
      <div className="flex-1 p-6 flex flex-col gap-3.5">
        {/* Title */}
        {effectiveInternalHref ? (
          // When on list/grid views, link to internal bookmark page
          <Link
            href={effectiveInternalHref}
            title={displayTitle}
            className="text-gray-900 dark:text-white hover:text-blue-600 transition-colors"
          >
            <h3 className="text-2xl font-semibold">{displayTitle}</h3>
          </Link>
        ) : (
          // When on individual bookmark page, link to external URL in new tab
          <ExternalLink
            href={url}
            title={displayTitle}
            showIcon={false}
            className="text-gray-900 dark:text-white hover:text-blue-600 transition-colors"
          >
            <h3 className="text-2xl font-semibold">{displayTitle}</h3>
          </ExternalLink>
        )}

        {/* Description */}
        <p className="flex-1 text-gray-700 dark:text-gray-300 text-base line-clamp-4-resilient">{description}</p>

        {/* Meta Information */}
        <div className="mt-auto space-y-2 text-sm text-gray-500 dark:text-gray-400">
          {/* Dates */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {formattedPublishDate ? (
                <>
                  <span>Published {formattedPublishDate}</span>
                  <span>·</span>
                  <span>Saved {formattedBookmarkDate}</span>
                </>
              ) : (
                <span>Saved {formattedBookmarkDate}</span>
              )}
            </div>

            {/* Share button right-aligned - only show when we have an internal href */}
            {effectiveInternalHref && <ShareButton bookmark={{ id, url }} shareUrl={effectiveInternalHref} />}
          </div>
        </div>

        {/* Tags - always render for SEO, motion effects only when mounted */}
        {rawTags.length > 0 && (
          <div className="flex flex-wrap gap-2.5 mt-3 pt-4 pb-4 border-t border-gray-200 dark:border-gray-700">
            {rawTags.map((raw) => {
              const label = formatTagDisplay(raw);
              return (
                <Link key={raw} href={`/bookmarks/tags/${tagToSlug(raw)}`} className="inline-block">
                  <span
                    className={cn(
                      "inline-block px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-medium transition-colors hover:bg-indigo-200 dark:hover:bg-indigo-800/60",
                      mounted && "transform hover:scale-102",
                    )}
                  >
                    {label}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
