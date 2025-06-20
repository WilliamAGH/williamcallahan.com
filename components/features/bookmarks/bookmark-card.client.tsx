/* eslint-disable @next/next/no-img-element */
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
import { Calendar, ExternalLink as LucideExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { type JSX, useEffect, useState } from "react";
import { normalizeDomain } from "../../../lib/utils/domain-utils";
import { ExternalLink } from "../../ui/external-link.client";
import { LogoImage } from "../../ui/logo-image.client";
import { ShareButton } from "./share-button.client";

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

export function BookmarkCardClient(props: BookmarkCardClientProps): JSX.Element {
  const { id, url, title, description, tags, ogImage, dateBookmarked, shareUrl: initialShareUrl } = props;
  const [mounted, setMounted] = useState(false);
  const [imageError, setImageError] = useState(false);
  const shareUrl = initialShareUrl;

  // Effects for handling client-side initialization
  useEffect(() => {
    setMounted(true);
  }, []);

  // Define the date variables but only format them when mounted to avoid hydration mismatches
  const displayBookmarkDate = dateBookmarked;
  const displayPublishDate = null;

  // Format dates only after component is mounted to avoid hydration issues
  const formatDate = (dateString: string): string => {
    if (!mounted) return "";

    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formattedBookmarkDate = mounted && displayBookmarkDate ? formatDate(displayBookmarkDate) : "";
  const formattedPublishDate = mounted && displayPublishDate ? formatDate(displayPublishDate) : null;

  // Handle image sources with multiple fallbacks
  // Priority: ogImage > logo
  // All images go through the unified /api/og-image route
  const getDisplayImageUrl = () => {
    // Always include bookmarkId for better fallbacks
    const baseParams = `&bookmarkId=${encodeURIComponent(id)}`;

    // If we have an ogImage (could be S3 key or URL)
    if (ogImage) {
      return `/api/og-image?url=${encodeURIComponent(ogImage)}${baseParams}`;
    }

    return null;
  };

  const displayImageUrl = getDisplayImageUrl();

  // Reset image error when displayImageUrl changes (happens on prop updates)
  const [prevDisplayImageUrl, setPrevDisplayImageUrl] = useState(displayImageUrl);
  if (displayImageUrl !== prevDisplayImageUrl) {
    setPrevDisplayImageUrl(displayImageUrl);
    setImageError(false);
  }

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

  if (!id || !url) return <></>;

  return (
    <div
      className={`relative flex flex-col bg-white/50 dark:bg-gray-800/50 backdrop-blur-lg ring-0 rounded-3xl overflow-hidden shadow-xl hover:shadow-2xl transform transition-all duration-200 ${mounted ? "hover:scale-[1.005]" : ""}`}
    >
      {/* Image Section with domain overlay */}
      <ExternalLink
        href={url}
        title={title}
        showIcon={false}
        className="relative w-full aspect-video overflow-hidden rounded-t-3xl bg-gray-100 dark:bg-gray-800 block"
      >
        <div className="relative w-full h-full">
          {/* Try unified OG image API first, but fall back to logo if image fails to load */}
          {displayImageUrl && !imageError ? (
            // biome-ignore lint/performance/noImgElement: its a fallback
            <img
              src={displayImageUrl}
              alt={title}
              loading="lazy"
              className="w-full h-full object-cover"
              onError={() => {
                console.warn(`[BookmarkCard] Image failed to load: ${displayImageUrl}`);
                setImageError(true); // Show fallback UI when image fails
              }}
            />
          ) : (
            /* Show logo fallback when no image sources are available OR when image loading failed */
            <div className="flex items-center justify-center w-full h-full">
              {domain ? (
                <LogoImage
                  src={`/api/logo?website=${encodeURIComponent(domain)}`}
                  width={130}
                  height={80}
                  alt={title}
                  className="object-contain max-w-[60%] max-h-[60%]"
                />
              ) : (
                <div className="text-gray-500">No Logo</div>
              )}
            </div>
          )}
          {/* Clickable domain overlay */}
          <div className="absolute bottom-3 left-3 bg-white/80 dark:bg-gray-800/80 px-3 py-1 flex items-center space-x-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <LucideExternalLinkIcon className="w-4 h-4 text-gray-700 dark:text-gray-200" />
            <span className="text-sm text-gray-700 dark:text-gray-200">{domainWithoutWWW}</span>
          </div>
        </div>
      </ExternalLink>
      {/* Content Section */}
      <div className="flex-1 p-6 flex flex-col gap-3.5">
        {/* Title */}
        <ExternalLink
          href={url}
          rawTitle
          title={displayTitle}
          showIcon={false}
          className="text-2xl font-semibold text-gray-900 dark:text-white hover:text-blue-600 transition-colors"
        >
          {displayTitle}
        </ExternalLink>

        {/* Description */}
        <p className="flex-1 text-gray-700 dark:text-gray-300 text-base line-clamp-5-resilient">{description}</p>

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

            {/* Share button right-aligned - only show when we have a share URL */}
            {shareUrl && <ShareButton bookmark={{ id, url }} shareUrl={shareUrl} />}
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
                    className={`inline-block px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-medium transition-colors hover:bg-indigo-200 dark:hover:bg-indigo-800/60 ${mounted ? "transform hover:scale-102" : ""}`}
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
