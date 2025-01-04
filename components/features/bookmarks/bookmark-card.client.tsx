"use client";

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

import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { ExternalLink } from '../../ui/external-link';
import { LogoImage } from '../../ui/logo-image';
import type { Bookmark } from '../../../types/bookmark';
import { normalizeDomain } from '../../../lib/logo-fetcher';

/**
 * Props for the BookmarkCardClient component
 * @interface
 * @extends {Bookmark}
 */
interface BookmarkCardClientProps extends Bookmark {
  /** Whether dark theme is active */
  isDarkTheme?: boolean;
}

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

export function BookmarkCardClient({
  id,
  url,
  title,
  description,
  tags,
  ogImage,
  dateBookmarked,
  datePublished,
  isDarkTheme
}: BookmarkCardClientProps): JSX.Element {
  const formattedBookmarkDate = new Date(dateBookmarked).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const formattedPublishDate = datePublished ? new Date(datePublished).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) : null;

  return (
    <div className="group rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200">
      <div className="p-4 sm:p-6">
        <div className="flex flex-col gap-5 sm:gap-6">
          {/* Header with OG Image */}
          <div className="flex items-start gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="w-24 h-24 relative flex-shrink-0 rounded-md overflow-hidden">
                <ExternalLink
                  href={url}
                  title={title}
                  rawTitle={true}
                  showIcon={false}
                >
                  <LogoImage
                    url={`/api/logo?website=${encodeURIComponent(normalizeDomain(url))}`}
                    width={96}
                    height={96}
                    website={url}
                    alt={title}
                    className="w-full h-full object-contain"
                    enableInversion
                    isDarkTheme={isDarkTheme}
                  />
                </ExternalLink>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <ExternalLink
                    href={url}
                    title={`Visit ${title}`}
                    showIcon={false}
                    className="text-lg font-semibold hover:text-gray-600 dark:hover:text-gray-300 line-clamp-2"
                  >
                    {title}
                  </ExternalLink>
                  <ExternalLink
                    href={url}
                    title={`Visit ${title}`}
                    showIcon={false}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
                  >
                    <ExternalLinkIcon className="w-4 h-4" />
                  </ExternalLink>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {formattedPublishDate && (
                    <>
                      <span>Published {formattedPublishDate}</span>
                      <span className="text-gray-400 dark:text-gray-500">•</span>
                    </>
                  )}
                  <span>Bookmarked {formattedBookmarkDate}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-3">
            {description}
          </p>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
