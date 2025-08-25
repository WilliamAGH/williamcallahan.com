/**
 * RelatedContentCard Component
 *
 * Unified card component for displaying different types of related content
 */

"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { formatDate as formatDateUtil, truncateText as truncateTextUtil } from "@/lib/utils";
import type { RelatedContentCardProps } from "@/types/related-content";
import { ExternalLink } from "@/components/ui/external-link.client";
import { tagToSlug } from "@/lib/utils/tag-utils";
import { kebabCase } from "@/lib/utils/formatters";

/**
 * Get type badge configuration
 */
function getTypeBadge(type: RelatedContentCardProps["item"]["type"]): { label: string; className: string } {
  switch (type) {
    case "bookmark":
      return {
        label: "LINK",
        className:
          "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800",
      };
    case "blog":
      return {
        label: "BLOG",
        className:
          "bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800",
      };
    case "investment":
      return {
        label: "INV",
        className:
          "bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800",
      };
    case "project":
      return {
        label: "PRJ",
        className:
          "bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800",
      };
    default:
      return {
        label: "DOC",
        className:
          "bg-gray-50 dark:bg-gray-950/30 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-800",
      };
  }
}

export function RelatedContentCard({ item, className = "", showScore = false }: RelatedContentCardProps) {
  const { type, title, description, url, metadata } = item;
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  // Build tag display (max 3 tags)
  const displayTags = metadata.tags?.slice(0, 3) || [];
  const typeBadge = getTypeBadge(type);
  const normalizedTagSet = new Set((metadata.tags || []).map(t => t.toLowerCase()));

  // Determine if image is from external source that might need unoptimized
  const isExternalImage = !!(
    metadata.imageUrl &&
    (metadata.imageUrl.startsWith("http://") || metadata.imageUrl.startsWith("https://"))
  );

  return (
    <div
      className={`
        related-content-card relative block p-4 rounded-lg border border-gray-200 dark:border-gray-700
        bg-white dark:bg-gray-800 hover:shadow-lg transition-shadow duration-200
        hover:border-blue-500 dark:hover:border-blue-400 ${className}
      `}
    >
      {/* Stretched overlay link to make the whole card clickable without nesting links */}
      <Link href={url} aria-label={`Open ${title}`} className="absolute inset-0 z-0">
        <span aria-hidden="true" />
      </Link>

      <article className="h-full flex flex-col pointer-events-none">
        {/* Header with type badge and metadata */}
        <header className="flex items-start justify-between mb-3">
          <span
            className={`
              inline-flex items-center justify-center px-2 py-0.5 
              text-[10px] font-mono font-semibold tracking-wider
              border rounded ${typeBadge.className}
            `}
            title={`Content type: ${type}`}
          >
            {typeBadge.label}
          </span>
          <div className="flex flex-col items-end text-xs text-gray-500 dark:text-gray-400">
            {metadata.date && <time dateTime={metadata.date}>{formatDateUtil(metadata.date)}</time>}
            {showScore && typeof item.score === "number" && (
              <span className="mt-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                {Math.round(item.score * 100)}% match
              </span>
            )}
          </div>
        </header>

        {/* Investment logos aligned with title - match investment card pattern */}
        {type === "investment" && metadata.imageUrl && !imageError ? (
          <div className="flex items-start gap-3 mb-3">
            <div className="relative w-10 h-10 flex-shrink-0 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
              {imageLoading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              <Image
                src={metadata.imageUrl}
                alt={title}
                fill
                className={`object-contain p-1 transition-opacity duration-200 ${imageLoading ? "opacity-0" : "opacity-100"}`}
                sizes="40px"
                onLoad={() => setImageLoading(false)}
                onError={() => {
                  setImageError(true);
                  setImageLoading(false);
                  console.warn(`Failed to load investment logo for ${title}: ${metadata.imageUrl}`);
                }}
                unoptimized={isExternalImage}
                priority={false}
              />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">{title}</h3>
            </div>
          </div>
        ) : (
          <>
            {/* Regular images for other content types */}
            {metadata.imageUrl && !imageError && type !== "investment" && (
              <div className="relative w-full h-32 mb-3 rounded overflow-hidden bg-gray-100 dark:bg-gray-700">
                {imageLoading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-gray-300 dark:border-gray-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                <Image
                  src={metadata.imageUrl}
                  alt={title}
                  fill
                  className={`object-cover transition-opacity duration-200 ${imageLoading ? "opacity-0" : "opacity-100"}`}
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  onLoad={() => setImageLoading(false)}
                  onError={() => {
                    setImageError(true);
                    setImageLoading(false);
                    console.warn(`Failed to load image for ${type}: ${metadata.imageUrl}`);
                  }}
                  unoptimized={isExternalImage}
                  priority={false}
                />
              </div>
            )}

            {/* Title for non-investment types or investments without logos */}
            {type !== "investment" || !metadata.imageUrl || imageError ? (
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 line-clamp-2">{title}</h3>
            ) : null}
          </>
        )}

        {/* Description */}
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 flex-grow line-clamp-3">
          {truncateTextUtil(description, 150)}
        </p>

        {/* Footer with tags and metadata */}
        <footer className="mt-auto pt-3 border-t border-gray-100 dark:border-gray-700">
          {/* Tags */}
          {displayTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2 pointer-events-auto relative z-10">
              {displayTags.map(tag => {
                const href =
                  type === "bookmark"
                    ? `/bookmarks/tags/${tagToSlug(tag)}`
                    : type === "blog"
                      ? `/blog/tags/${kebabCase(tag)}`
                      : null;
                const chip = (
                  <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">
                    {tag}
                  </span>
                );
                return href ? (
                  <Link key={tag} href={href} className="inline-block pointer-events-auto relative z-10">
                    {chip}
                  </Link>
                ) : (
                  <span key={tag} className="inline-block">
                    {chip}
                  </span>
                );
              })}
              {metadata.tags && metadata.tags.length > 3 && (
                <span className="px-2 py-0.5 text-xs text-gray-400 dark:text-gray-500">
                  +{metadata.tags.length - 3} more
                </span>
              )}
            </div>
          )}

          {/* Type-specific metadata */}
          <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
            {/* Domain for bookmarks */}
            {type === "bookmark" && metadata.domain && <span className="truncate">{metadata.domain}</span>}

            {/* Author for blog posts */}
            {type === "blog" && metadata.author && (
              <span className="flex items-center gap-1">
                {metadata.author.avatar && (
                  <Image
                    src={metadata.author.avatar}
                    alt={metadata.author.name}
                    width={16}
                    height={16}
                    className="rounded-full"
                  />
                )}
                <span>{metadata.author.name}</span>
              </span>
            )}

            {/* Reading time for blog posts */}
            {type === "blog" && metadata.readingTime && <span>{metadata.readingTime} min read</span>}

            {/* Stage for investments */}
            {type === "investment" && metadata.stage && !normalizedTagSet.has(String(metadata.stage).toLowerCase()) && (
              <span>{metadata.stage}</span>
            )}

            {/* Category for investments and projects */}
            {(type === "investment" || type === "project") &&
              metadata.category &&
              !(type === "investment" && normalizedTagSet.has(String(metadata.category).toLowerCase())) && (
                <span>{metadata.category}</span>
              )}

            {/* aVenture research link for investments - separate external link */}
            {type === "investment" && metadata.aventureUrl && (
              <ExternalLink
                href={metadata.aventureUrl}
                title={`${title} - aVenture Startup Research`}
                showIcon={false}
                className="ml-auto inline-flex items-center bg-slate-100 dark:bg-transparent hover:bg-slate-200 dark:hover:bg-gray-700/50 px-2 py-1 rounded-full transition-colors pointer-events-auto relative z-10"
              >
                <Image
                  src="https://s3-storage.callahan.cloud/images/ui-components/aVenture-research-button.png"
                  alt="aVenture"
                  width={16}
                  height={16}
                  className="inline-block h-4 w-4"
                />
              </ExternalLink>
            )}
          </div>
        </footer>
      </article>
    </div>
  );
}
