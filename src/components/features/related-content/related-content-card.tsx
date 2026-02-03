"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { formatDate as formatDateUtil, truncateText as truncateTextUtil } from "@/lib/utils";
import type { RelatedContentCardProps } from "@/types/related-content";
import { ExternalLink } from "@/components/ui/external-link.client";
import { tagToSlug } from "@/lib/utils/tag-utils";
import { kebabCase } from "@/lib/utils/formatters";
import { getStaticImageUrl } from "@/lib/data-access/static-images";
import { getOptimizedImageSrc, shouldBypassOptimizer } from "@/lib/utils/cdn-utils";
function sanitizeExternalHref(raw?: string): string | null {
  if (!raw) return null;
  const input = raw.trim();
  if (!input) return null;
  const hasScheme = /^https?:\/\//i.test(input);
  try {
    const urlObj = new URL(hasScheme ? input : `https://${input}`);
    if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") return null;
    return urlObj.toString();
  } catch {
    return null;
  }
}

function getTypeBadge(type: RelatedContentCardProps["item"]["type"]): {
  label: string;
  className: string;
} {
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
    case "book":
      return {
        label: "BOOK",
        className:
          "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800",
      };
    default:
      return {
        label: "DOC",
        className:
          "bg-gray-50 dark:bg-gray-950/30 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-800",
      };
  }
}

function getImageProxyWidth(type: RelatedContentCardProps["item"]["type"]): number {
  if (type === "investment") return 80;
  if (type === "book") return 192;
  return 800;
}

export function RelatedContentCard({
  item,
  className = "",
  showScore = false,
}: RelatedContentCardProps) {
  const { type, title, description, url, metadata } = item;
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  const aventureIconSrc = getStaticImageUrl("/images/ui-components/aVenture-research-button.png");

  const displayTags = metadata.tags?.slice(0, 6) || [];
  const typeBadge = getTypeBadge(type);
  const normalizedTagSet = new Set((metadata.tags || []).map((t) => t.toLowerCase()));
  const imageProxyWidth = getImageProxyWidth(type);
  const imageUrl = metadata.imageUrl
    ? getOptimizedImageSrc(metadata.imageUrl, undefined, imageProxyWidth)
    : undefined;
  const shouldBypassImageOptimization = shouldBypassOptimizer(imageUrl);

  const aventureHref: string | null =
    type === "investment" && typeof metadata.aventureUrl === "string"
      ? sanitizeExternalHref(metadata.aventureUrl)
      : null;

  return (
    <div
      className={`
        related-content-card relative block p-4 rounded-lg border border-gray-200 dark:border-gray-700
        bg-white dark:bg-gray-800 hover:shadow-lg transition-shadow duration-200
        hover:border-blue-500 dark:hover:border-blue-400 ${className}
      `}
    >
      <Link
        href={url}
        aria-label={`Open ${title}`}
        className="absolute inset-0 z-0 focus:ring-2 focus:ring-blue-500 focus:outline-none rounded-lg"
        prefetch={false}
      >
        <span aria-hidden="true" />
      </Link>

      <article className="h-full flex flex-col pointer-events-none">
        <header className="flex items-start justify-between mb-3">
          {type === "bookmark" && metadata.domain ? (
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[60%]">
              {metadata.domain}
            </span>
          ) : (
            <span className="w-0" />
          )}
          <div className="flex flex-col items-end text-xs text-gray-500 dark:text-gray-400">
            {metadata.date && type !== "investment" && (
              <time dateTime={metadata.date}>{formatDateUtil(metadata.date)}</time>
            )}
            {showScore && typeof item.score === "number" && (
              <span className="mt-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                {Math.round(item.score * 100)}% match
              </span>
            )}
          </div>
        </header>

        {type === "investment" && imageUrl && !imageError ? (
          <div className="flex items-start gap-3 mb-3">
            <div className="relative w-10 h-10 flex-shrink-0 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
              {imageLoading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              <Image
                src={imageUrl}
                alt={title}
                fill
                className={`object-contain p-1 transition-opacity duration-200 ${imageLoading ? "opacity-0" : "opacity-100"}`}
                sizes="40px"
                onLoad={() => setImageLoading(false)}
                onError={() => {
                  setImageError(true);
                  setImageLoading(false);
                  if (process.env.NODE_ENV === "development") {
                    console.warn(
                      `Failed to load investment logo for ${title}: ${metadata.imageUrl}`,
                    );
                  }
                }}
                unoptimized={shouldBypassImageOptimization}
                priority={false}
              />
            </div>
            <div className="flex-1 min-w-0 flex items-start gap-2">
              <h3 className="flex-1 font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">
                {title}
              </h3>
              {typeof aventureHref === "string" && (
                <ExternalLink
                  href={aventureHref}
                  title={`${title} - aVenture Startup Research`}
                  showIcon={false}
                  className="flex-shrink-0 inline-flex items-center bg-slate-100 dark:bg-transparent hover:bg-slate-200 dark:hover:bg-gray-700/50 p-1.5 rounded-full transition-colors pointer-events-auto relative z-10"
                >
                  <img
                    src={aventureIconSrc}
                    alt="aVenture"
                    width={14}
                    height={14}
                    className="inline-block h-3.5 w-3.5"
                    loading="lazy"
                  />
                </ExternalLink>
              )}
            </div>
          </div>
        ) : type === "book" && imageUrl && !imageError ? (
          <div className="flex items-start gap-4 mb-3">
            <div className="relative w-24 flex-shrink-0 aspect-[2/3] rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 shadow-md ring-1 ring-gray-200/50 dark:ring-gray-600/50">
              {imageLoading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              <Image
                src={imageUrl}
                alt={title}
                fill
                className={`object-cover transition-opacity duration-200 ${imageLoading ? "opacity-0" : "opacity-100"}`}
                sizes="96px"
                quality={85}
                onLoad={() => setImageLoading(false)}
                onError={() => {
                  setImageError(true);
                  setImageLoading(false);
                  if (process.env.NODE_ENV === "development") {
                    console.warn(`Failed to load book cover for ${title}: ${metadata.imageUrl}`);
                  }
                }}
                unoptimized={shouldBypassImageOptimization}
                priority={false}
              />
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-3 text-sm leading-snug">
                {title}
              </h3>
              {metadata.authors && metadata.authors.length > 0 && (
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                  {metadata.authors.slice(0, 2).join(", ")}
                  {metadata.authors.length > 2 && ` +${metadata.authors.length - 2}`}
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            {imageUrl && !imageError && type !== "investment" && type !== "book" && (
              <div className="relative w-full h-32 mb-3 rounded overflow-hidden bg-gray-100 dark:bg-gray-700">
                {imageLoading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-gray-300 dark:border-gray-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                <Image
                  src={imageUrl}
                  alt={title}
                  fill
                  className={`object-cover transition-opacity duration-200 ${imageLoading ? "opacity-0" : "opacity-100"}`}
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  onLoad={() => setImageLoading(false)}
                  onError={() => {
                    setImageError(true);
                    setImageLoading(false);
                    if (process.env.NODE_ENV === "development") {
                      console.warn(`Failed to load image for ${type}: ${metadata.imageUrl}`);
                    }
                  }}
                  unoptimized={shouldBypassImageOptimization}
                  priority={false}
                />
              </div>
            )}

            {(type !== "investment" && type !== "book") || !imageUrl || imageError ? (
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 line-clamp-2">
                {title}
              </h3>
            ) : null}
          </>
        )}

        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 flex-grow line-clamp-3">
          {truncateTextUtil(description, 150)}
        </p>

        <footer className="mt-auto pt-3 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-end gap-2 mb-2">
            {displayTags.length > 0 && (
              <div className="flex-1 flex flex-wrap gap-1 max-h-[3.25rem] overflow-hidden pointer-events-auto relative z-10">
                {displayTags.map((tag) => {
                  const href =
                    type === "bookmark"
                      ? `/bookmarks/tags/${tagToSlug(tag)}`
                      : type === "blog"
                        ? `/blog/tags/${kebabCase(tag)}`
                        : type === "project"
                          ? `/projects?tag=${encodeURIComponent(tag)}`
                          : null;
                  const chip = (
                    <span className="px-1.5 py-0.5 text-[11px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded truncate max-w-[7rem]">
                      {tag}
                    </span>
                  );
                  return href ? (
                    <Link
                      key={tag}
                      href={href}
                      className="inline-block pointer-events-auto relative z-10"
                      prefetch={false}
                    >
                      {chip}
                    </Link>
                  ) : (
                    <span key={tag} className="inline-block">
                      {chip}
                    </span>
                  );
                })}
                {metadata.tags && metadata.tags.length > 6 && (
                  <span className="px-1.5 py-0.5 text-[11px] text-gray-400 dark:text-gray-500">
                    +{metadata.tags.length - 6}
                  </span>
                )}
              </div>
            )}
            <span
              className={`
                flex-shrink-0 self-end inline-flex items-center justify-center px-2 py-0.5
                text-[10px] font-mono font-semibold tracking-wider
                border rounded ${typeBadge.className}
              `}
            >
              {typeBadge.label}
            </span>
          </div>

          {((type === "blog" && metadata.readingTime) ||
            (type === "investment" && (metadata.stage || metadata.category)) ||
            (type === "project" && metadata.category)) && (
            <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
              {type === "blog" && metadata.readingTime && (
                <span>{metadata.readingTime} min read</span>
              )}

              {type === "investment" &&
                metadata.stage &&
                !normalizedTagSet.has(String(metadata.stage).toLowerCase()) && (
                  <span>{metadata.stage}</span>
                )}

              {(type === "investment" || type === "project") &&
                metadata.category &&
                !normalizedTagSet.has(String(metadata.category).toLowerCase()) && (
                  <span>{metadata.category}</span>
                )}
            </div>
          )}
        </footer>
      </article>
    </div>
  );
}
