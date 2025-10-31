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
import { formatDate as utilFormatDate } from "@/lib/utils";
import { Calendar, ExternalLink as LucideExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { type JSX } from "react";
import { normalizeDomain } from "../../../lib/utils/domain-utils";
import { ExternalLink } from "../../ui/external-link.client";
import { ShareButton } from "./share-button.client";
import { selectBestImage } from "@/lib/bookmarks/bookmark-helpers";
import { usePathname } from "next/navigation";
import { OptimizedCardImage } from "@/components/ui/logo-image.client";

import type { BookmarkCardClientProps } from "@/types";

// Display configuration
const MAX_TITLE_WORDS = 10;

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

  // Define the date variables but only format them when mounted to avoid hydration mismatches
  const displayBookmarkDate = dateBookmarked;
  const displayPublishDate = null;

  // Use stable date formatting to avoid hydration issues
  const formattedBookmarkDate = displayBookmarkDate ? utilFormatDate(displayBookmarkDate) : "";
  const formattedPublishDate = displayPublishDate ? utilFormatDate(displayPublishDate) : null;

  // Use centralized image selection logic that properly handles all fallback cases
  // This ensures consistency across server and client components
  const displayImageUrl = selectBestImage({ ogImage, content, id, url }, { includeScreenshots: true });

  // DEV-ONLY: Log the image selection result for debugging
  if (process.env.NODE_ENV === "development") {
    console.log(`[BookmarkCardClient:${id}] Image selection:`, {
      ogImage,
      contentExists: !!content,
      imageUrl: content?.imageUrl,
      imageAssetId: content?.imageAssetId,
      screenshotAssetId: content?.screenshotAssetId,
      selectedImage: displayImageUrl,
    });
  }

  const domain = normalizeDomain(url);
  const domainWithoutWWW = domain.replace(/^www\./, "");

  // Process tags using shared utilities for consistency
  const rawTags = normalizeTagsToStrings(tags || []);

  // Truncate title to configured number of words
  const titleWords = title.split(" ");
  const displayTitle =
    titleWords.length > MAX_TITLE_WORDS ? `${titleWords.slice(0, MAX_TITLE_WORDS).join(" ")}...` : title;

  // Don't use a placeholder for SSR - render full card without interactive elements
  // Server will render as much as possible for SEO, client will hydrate

  if (!id || !url) return null;

  return (
    <div className="relative flex flex-col bg-white/50 dark:bg-gray-800/50 backdrop-blur-lg ring-0 rounded-3xl overflow-hidden shadow-xl hover:shadow-2xl transform transition-all duration-200 hover:scale-[1.005]">
      {/* Image Section with domain overlay */}
      <div className="relative w-full aspect-video overflow-hidden rounded-t-3xl bg-gray-100 dark:bg-gray-800">
        {/* Image background - clickable link */}
        {effectiveInternalHref ? (
          // When on list/grid views, link to internal bookmark page
          <Link href={effectiveInternalHref} title={title} className="absolute inset-0 block">
            <div className="relative w-full h-full">
              {/* Display OpenGraph image, screenshot, or placeholder */}
              <OptimizedCardImage src={displayImageUrl ?? null} alt={title} />
            </div>
          </Link>
        ) : (
          // When on individual bookmark page, link to external URL in new tab
          <ExternalLink href={url} title={title} showIcon={false} className="absolute inset-0 block">
            <div className="relative w-full h-full">
              {/* Display OpenGraph image, screenshot, or placeholder */}
              <OptimizedCardImage src={displayImageUrl ?? null} alt={title} />
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
            {rawTags.map(raw => {
              const label = formatTagDisplay(raw);
              return (
                <Link key={raw} href={`/bookmarks/tags/${tagToSlug(raw)}`} className="inline-block">
                  <span className="inline-block px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-medium transition-colors hover:bg-indigo-200 dark:hover:bg-indigo-800/60 transform hover:scale-[1.02]">
                    {label}
                  </span>
                </Link>
              );
            })}
          </div>
        )}

        {/* Intentionally do not render AI Insights/Personal Notes in list/grid views.
            Detailed notes and summaries are displayed exclusively on the individual
            bookmark page component to avoid cluttering the list UI. */}
      </div>
    </div>
  );
}
