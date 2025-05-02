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

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink as LucideExternalLinkIcon, Bookmark, Calendar } from 'lucide-react';
import Link from 'next/link';
import { ExternalLink } from '../../ui/external-link.client';
import { LogoImage } from '../../ui/logo-image.client';
import type { UnifiedBookmark, BookmarkTag } from '@/types';
import { normalizeDomain } from '../../../lib/utils/domain-utils';

/**
 * Props for the BookmarkCardClient component
 * @interface
 * @extends {UnifiedBookmark}
 */
interface BookmarkCardClientProps extends UnifiedBookmark {
  /** Whether dark theme is active */
  isDarkTheme?: boolean;
  favourited?: boolean;
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
  isDarkTheme,
  content,
  assets,
  createdAt,
  favourited,
}: BookmarkCardClientProps): JSX.Element {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Handle dates
  const displayBookmarkDate = createdAt ?? dateBookmarked;
  const formattedBookmarkDate = new Date(displayBookmarkDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const displayPublishDate = content?.datePublished ?? datePublished;
  const formattedPublishDate = displayPublishDate ? new Date(displayPublishDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) : null;

  // Handle image sources with fallbacks
  const displayImageUrl = content?.imageUrl ?? ogImage;
  const domain = normalizeDomain(url);
  const domainWithoutWWW = domain.replace(/^www\./, '');

  // Get author/publisher info
  const author = content?.author || null;
  const publisher = content?.publisher || domainWithoutWWW;

  // Process tags for display
  const rawTags: string[] = (Array.isArray(tags) ? tags : []).map(tag =>
    typeof tag === 'string' ? tag : (tag.name || '')
  ).filter(Boolean);

  // Format tags: Title Case unless mixed-case proper nouns
  const renderableTags = rawTags.map(tag => {
    // preserve if mixed-case beyond first char (e.g. iPhone)
    if (/[A-Z]/.test(tag.slice(1))) {
      return tag;
    }
    return tag
      .split(/[\s-]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  });

  // Truncate title to max 10 words
  const maxTitleWords = 10;
  const titleWords = title.split(' ');
  const displayTitle = titleWords.length > maxTitleWords
    ? titleWords.slice(0, maxTitleWords).join(' ') + '...'
    : title;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.005 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="relative flex flex-col bg-white/50 dark:bg-gray-800/50 backdrop-blur-lg ring-0 rounded-3xl overflow-hidden shadow-xl hover:shadow-2xl transform transition-all duration-200"
    >
      {/* Image Section with domain overlay */}
      <div className="relative w-full aspect-video overflow-hidden rounded-t-3xl">
        {displayImageUrl ? (
          <img
            src={displayImageUrl}
            alt={title}
            loading="lazy"
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <LogoImage
            src={`/api/logo?website=${encodeURIComponent(domain)}`}
            width={160}
            height={90}
            alt={title}
            className="object-contain w-full h-full"
          />
        )}
        {/* Clickable domain overlay */}
        <ExternalLink href={url} showIcon={false} className="absolute bottom-3 left-3 bg-white/80 dark:bg-gray-800/80 px-3 py-1 flex items-center space-x-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
          <LucideExternalLinkIcon className="w-4 h-4 text-gray-700 dark:text-gray-200" />
          <span className="text-sm text-gray-700 dark:text-gray-200">{domainWithoutWWW}</span>
        </ExternalLink>
      </div>

      {/* Content Section */}
      <div className="flex-1 p-6 flex flex-col gap-4">
        {/* Title */}
        <ExternalLink href={url} rawTitle title={displayTitle} showIcon={false} className="text-2xl font-semibold text-gray-900 dark:text-white hover:text-blue-600 transition-colors">
          {displayTitle}
        </ExternalLink>

        {/* Description */}
        <p className="flex-1 text-gray-700 dark:text-gray-300 text-base leading-6 overflow-hidden">
          {description}
        </p>

        {/* Meta Information */}
        <div className="mt-auto space-y-2 text-sm text-gray-500 dark:text-gray-400">
          {/* Dates */}
          <div className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            {formattedPublishDate ? (
              <><span>Published {formattedPublishDate}</span><span>·</span><span>Saved {formattedBookmarkDate}</span></>
            ) : (
              <span>Saved {formattedBookmarkDate}</span>
            )}
          </div>
        </div>

        {/* Tags */}
        {renderableTags.length > 0 && (
          <div className="flex flex-wrap gap-3.5 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            {renderableTags.map((label, idx) => {
              const raw = rawTags[idx];
              return (
                <Link
                  key={raw}
                  href={`/bookmarks/tags/${encodeURIComponent(raw.toLowerCase().replace(/\s+/g, '-'))}`}
                >
                  <motion.span
                    whileHover={{ scale: 1.02 }}
                    className="px-3.5 py-1.5 rounded-full bg-indigo-600 text-white text-sm transition-colors"
                  >
                    {label}
                  </motion.span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Favorite Icon */}
      {favourited && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="absolute top-5 right-5 bg-yellow-500 p-2 rounded-full shadow-lg"
        >
          <Bookmark className="w-5 h-5 text-white" />
        </motion.div>
      )}
    </motion.div>
  );
}
