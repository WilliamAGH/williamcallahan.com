"use client";

import { formatTagDisplay, normalizeTagsToStrings, tagToSlug } from "@/lib/utils/tag-utils";
import { formatDate as utilFormatDate } from "@/lib/utils";
import { Calendar, Clock, ExternalLink as LucideExternalLinkIcon, Star } from "lucide-react";
import Link from "next/link";
import { type JSX } from "react";
import { normalizeDomain } from "../../../lib/utils/domain-utils";
import { ExternalLink } from "../../ui/external-link.client";
import { Badge } from "@/components/ui/badge";
import { ShareButton } from "./share-button.client";
import { selectBestImage } from "@/lib/bookmarks/bookmark-helpers";
import { usePathname } from "next/navigation";
import { OptimizedCardImage } from "@/components/ui/logo-image.client";

import type { BookmarkCardClientProps } from "@/types/features/bookmarks";

// Display configuration
const MAX_TITLE_WORDS = 10;

export function BookmarkCardClient(props: BookmarkCardClientProps): JSX.Element | null {
  const {
    id,
    url,
    title,
    description,
    tags,
    ogImage,
    content,
    dateBookmarked,
    internalHref,
    preload = false,
    readingTime,
    isFavorite,
    note,
    category,
    variant = "default",
    showCategoryBadge = true,
  } = props;
  const pathname = usePathname();
  const isHero = variant === "hero";
  const isCompact = variant === "compact";

  // Avoid self-referential links when the card is rendered on its own detail route.
  const effectiveInternalHref =
    internalHref && pathname !== internalHref ? internalHref : undefined;

  // Use stable date formatting to avoid hydration issues
  const formattedBookmarkDate = dateBookmarked ? utilFormatDate(dateBookmarked) : "";
  const parts = formattedBookmarkDate.split(" ");
  const compactBookmarkDate =
    parts.length >= 3
      ? `${parts[0]?.slice(0, 3)} ${parts[1]?.replace(",", "")}, ${parts[2]}`
      : formattedBookmarkDate;
  const hoverDateLabel = formattedBookmarkDate ? `Bookmark saved on ${formattedBookmarkDate}` : "";

  // Centralized image selection keeps fallback behavior consistent.
  const displayImageUrl = selectBestImage(
    { ogImage, content, id, url },
    { includeScreenshots: true },
  );

  // normalizeDomain already strips www prefix via stripWwwPrefix()
  const domainWithoutWWW = normalizeDomain(url);

  // Process tags using shared utilities for consistency
  const rawTags = normalizeTagsToStrings(tags || []);

  // Truncate title to configured number of words
  const titleWords = title.split(" ");
  const displayTitle =
    titleWords.length > MAX_TITLE_WORDS
      ? `${titleWords.slice(0, MAX_TITLE_WORDS).join(" ")}...`
      : title;

  if (!id || !url) return null;

  if (isCompact) {
    const COMPACT_TAG_LIMIT = 3;
    return (
      <div className="relative flex h-[23rem] flex-col overflow-hidden rounded-2xl bg-white/50 shadow-xl ring-0 backdrop-blur-lg transition-all duration-200 hover:scale-[1.005] hover:shadow-2xl dark:bg-gray-800/50">
        <div className="relative w-full aspect-video overflow-hidden rounded-t-2xl bg-gray-100 dark:bg-gray-800">
          {effectiveInternalHref ? (
            <Link
              href={effectiveInternalHref}
              title={title}
              className="absolute inset-0 block"
              prefetch={false}
            >
              <div className="relative w-full h-full">
                <OptimizedCardImage src={displayImageUrl ?? null} alt={title} preload={preload} />
              </div>
            </Link>
          ) : (
            <ExternalLink
              href={url}
              title={title}
              showIcon={false}
              className="absolute inset-0 block"
            >
              <div className="relative w-full h-full">
                <OptimizedCardImage src={displayImageUrl ?? null} alt={title} preload={preload} />
              </div>
            </ExternalLink>
          )}
          <ExternalLink
            href={url}
            title={`Visit ${domainWithoutWWW}`}
            showIcon={false}
            className="absolute bottom-2 left-2 bg-white/80 dark:bg-gray-800/80 px-2 py-0.5 flex items-center space-x-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors z-10"
          >
            <LucideExternalLinkIcon className="w-3 h-3 text-gray-700 dark:text-gray-200" />
            <span className="text-xs text-gray-700 dark:text-gray-200">{domainWithoutWWW}</span>
          </ExternalLink>
        </div>
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <div className="min-h-0 flex-1 overflow-hidden">
            {effectiveInternalHref ? (
              <Link
                href={effectiveInternalHref}
                title={displayTitle}
                className="text-gray-900 transition-colors hover:text-blue-600 dark:text-white"
                prefetch={false}
              >
                <h3 className="line-clamp-3 text-sm font-semibold leading-5">{displayTitle}</h3>
              </Link>
            ) : (
              <ExternalLink
                href={url}
                title={displayTitle}
                showIcon={false}
                className="text-gray-900 transition-colors hover:text-blue-600 dark:text-white"
              >
                <h3 className="line-clamp-3 text-sm font-semibold leading-5">{displayTitle}</h3>
              </ExternalLink>
            )}
            {rawTags.length > 0 && (
              <div className="mt-2 flex flex-wrap content-start gap-1.5 overflow-hidden">
                {rawTags.slice(0, COMPACT_TAG_LIMIT).map((raw) => (
                  <Link
                    key={raw}
                    href={`/bookmarks/tags/${tagToSlug(raw)}`}
                    className="inline-block"
                    prefetch={false}
                  >
                    <Badge
                      variant="outline"
                      className="max-w-[11rem] truncate text-[10px] hover:bg-accent"
                    >
                      {formatTagDisplay(raw)}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            {formattedBookmarkDate && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 dark:border-gray-700 px-2 py-0.5 text-[11px]"
                title={hoverDateLabel}
                aria-label={hoverDateLabel}
              >
                <Calendar className="w-3 h-3" />
                {compactBookmarkDate}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative flex flex-col bg-white/50 dark:bg-gray-800/50 backdrop-blur-lg ring-0 rounded-3xl overflow-hidden shadow-xl hover:shadow-2xl transform transition-all duration-200 hover:scale-[1.005] ${
        isHero ? "md:shadow-2xl" : ""
      }`}
    >
      {/* Image Section with domain overlay */}
      <div className="relative w-full aspect-video overflow-hidden rounded-t-3xl bg-gray-100 dark:bg-gray-800">
        {/* Image background - clickable link */}
        {effectiveInternalHref ? (
          // When on list/grid views, link to internal bookmark page
          // prefetch={false} reduces request volume in list contexts (see docs/standards/nextjs-framework.md §Link Prefetch)
          <Link
            href={effectiveInternalHref}
            title={title}
            className="absolute inset-0 block"
            prefetch={false}
          >
            <div className="relative w-full h-full">
              {/* Display OpenGraph image, screenshot, or placeholder */}
              <OptimizedCardImage src={displayImageUrl ?? null} alt={title} preload={preload} />
            </div>
          </Link>
        ) : (
          // When on individual bookmark page, link to external URL in new tab
          <ExternalLink
            href={url}
            title={title}
            showIcon={false}
            className="absolute inset-0 block"
          >
            <div className="relative w-full h-full">
              {/* Display OpenGraph image, screenshot, or placeholder */}
              <OptimizedCardImage src={displayImageUrl ?? null} alt={title} preload={preload} />
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
        {showCategoryBadge && category && (
          <div className="mb-1">
            <Badge variant="secondary" className="uppercase tracking-wide">
              {category}
            </Badge>
          </div>
        )}

        {/* Title */}
        {effectiveInternalHref ? (
          // When on list/grid views, link to internal bookmark page
          <Link
            href={effectiveInternalHref}
            title={displayTitle}
            className="text-gray-900 dark:text-white hover:text-blue-600 transition-colors"
            prefetch={false}
          >
            <h3 className={isHero ? "text-3xl font-semibold" : "text-2xl font-semibold"}>
              {displayTitle}
            </h3>
          </Link>
        ) : (
          // When on individual bookmark page, link to external URL in new tab
          <ExternalLink
            href={url}
            title={displayTitle}
            showIcon={false}
            className="text-gray-900 dark:text-white hover:text-blue-600 transition-colors"
          >
            <h3 className={isHero ? "text-3xl font-semibold" : "text-2xl font-semibold"}>
              {displayTitle}
            </h3>
          </ExternalLink>
        )}

        {/* Description */}
        <p
          className={`flex-1 text-gray-700 dark:text-gray-300 line-clamp-4-resilient ${
            isHero ? "text-base" : "text-sm"
          }`}
        >
          {description}
        </p>

        {isHero && note && (
          <p className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-900/20 px-3 py-2 text-sm text-blue-900 dark:text-blue-100 line-clamp-2">
            {note}
          </p>
        )}

        {/* Meta Information */}
        <div className="mt-auto space-y-2 text-sm text-gray-500 dark:text-gray-400">
          {/* Dates */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span title={hoverDateLabel}>Saved {formattedBookmarkDate}</span>
              {readingTime && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {Math.max(1, Math.ceil(readingTime))} min read
                </span>
              )}
              {isFavorite && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
            </div>

            {/* Share button right-aligned - only show when we have an internal href */}
            {effectiveInternalHref && (
              <ShareButton bookmark={{ id, url }} shareUrl={effectiveInternalHref} />
            )}
          </div>
        </div>

        {/* Tags - always render for SEO, motion effects only when mounted */}
        {rawTags.length > 0 && (
          <div className="flex flex-wrap gap-2.5 mt-3 pt-4 pb-4 border-t border-gray-200 dark:border-gray-700">
            {rawTags.map((raw) => {
              const label = formatTagDisplay(raw);
              return (
                <Link
                  key={raw}
                  href={`/bookmarks/tags/${tagToSlug(raw)}`}
                  className="inline-block"
                  prefetch={false}
                >
                  <span className="inline-block transform hover:scale-[1.02] transition-transform">
                    <Badge variant="outline" className="hover:bg-accent">
                      {label}
                    </Badge>
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
