/**
 * OpenGraph Metadata Implementation
 * @module lib/seo/opengraph
 * @description
 * Dedicated module for generating OpenGraph metadata following the ogp.me specification.
 * This module is responsible for:
 * - Generating article-specific OpenGraph metadata
 * - Handling image URLs and types
 * - Managing OpenGraph-specific fields like locale and site name
 *
 * This module is consumed by lib/seo/metadata.ts to provide OpenGraph data as part
 * of the complete metadata object.
 *
 * @see {@link "./metadata.ts"} - For the main metadata implementation
 * @see {@link "../../data/metadata.ts"} - For base metadata values
 * @see {@link "https://ogp.me"} - OpenGraph protocol specification
 * @see {@link "https://ogp.me/#type_article"} - Article object specification
 */

import type { OpenGraph } from 'next/dist/lib/metadata/types/opengraph-types';
import type { ArticleOpenGraph } from '../../types/seo';
import { SITE_TITLE, SITE_DESCRIPTION, metadata } from '../../data/metadata';
import type { ArticleParams } from './constants';
import { ensureAbsoluteUrl, getImageTypeFromUrl, formatSeoDate } from './utils';

/**
 * Base OpenGraph metadata configuration
 * Used as a foundation for all OpenGraph metadata objects
 * Follows the OpenGraph protocol specification from ogp.me
 *
 * @see {@link "../../data/metadata.ts"} - Source of these values
 * @see {@link "https://ogp.me"} - OpenGraph protocol specification
 */
export const BASE_OG_METADATA: OpenGraph = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  type: 'website',
  url: metadata.site.url,
  images: [{
    url: ensureAbsoluteUrl(metadata.defaultImage.url),
    width: metadata.defaultImage.width,
    height: metadata.defaultImage.height,
    alt: metadata.defaultImage.alt,
    type: metadata.defaultImage.type,
  }],
  locale: metadata.site.locale,
  siteName: metadata.site.name,
};

/**
 * Creates OpenGraph metadata specifically for article pages
 * Handles:
 * - Article-specific metadata (publish date, modified date, tags)
 * - Image URL resolution and type detection
 * - Proper metadata structure according to ogp.me spec
 *
 * @param {ArticleParams} params - Article metadata parameters
 * @returns {ArticleOpenGraph} OpenGraph metadata object following Next.js Metadata API
 * @see {@link "https://ogp.me/#type_article"} - Article object specification
 */
export function createArticleOgMetadata({
  title,
  description,
  url,
  image,
  datePublished,
  dateModified,
  tags,
}: ArticleParams): ArticleOpenGraph {
  // Format dates in Pacific Time with proper offset
  const formattedPublished = formatSeoDate(datePublished);
  const formattedModified = formatSeoDate(dateModified);

  const imageDescriptor = image ? {
    url: ensureAbsoluteUrl(image),
    width: metadata.defaultImage.width,
    height: metadata.defaultImage.height,
    alt: title,
    type: getImageTypeFromUrl(image),
  } : {
    url: ensureAbsoluteUrl(metadata.defaultImage.url),
    width: metadata.defaultImage.width,
    height: metadata.defaultImage.height,
    alt: metadata.defaultImage.alt,
    type: metadata.defaultImage.type,
  };

  return {
    ...BASE_OG_METADATA,
    title,
    description,
    type: 'article',
    url,
    images: [imageDescriptor],
    article: {
      publishedTime: formattedPublished,
      modifiedTime: formattedModified,
      section: metadata.article.section,
      tags: tags || [],
      authors: [metadata.author],
    },
    // Add dates at root level for better compatibility
    publishedTime: formattedPublished,
    modifiedTime: formattedModified,
  };
}
