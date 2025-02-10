/**
 * Core SEO Metadata Implementation
 * @module lib/seo/metadata
 * @description
 * Handles the generation of all non-OpenGraph metadata for the site, including:
 * - Browser tab title and description
 * - Canonical URLs
 * - Twitter card metadata
 * - Author and publisher information
 * - Format detection settings
 *
 * This module focuses on Next.js's Metadata API structure. It delegates OpenGraph
 * metadata generation to the opengraph.ts module.
 *
 * @see {@link "./opengraph.ts"} - For OpenGraph metadata generation
 * @see {@link "../../data/metadata.ts"} - For base metadata values
 * @see {@link "https://nextjs.org/docs/app/api-reference/functions/generate-metadata"} - Next.js Metadata API
 */

import { Metadata } from 'next';
import { SITE_TITLE, SITE_DESCRIPTION_SHORT, SITE_NAME, metadata as siteMetadata } from '../../data/metadata';
import { SEO_DATE_FIELDS, type ArticleParams } from './constants';
import { formatSeoDate, ensureAbsoluteUrl } from './utils';
import { createArticleOgMetadata } from './opengraph';
import type { ArticleMetadata, ArticleSchema } from '../../types/seo';

/**
 * Base metadata configuration for all pages
 * Includes common metadata fields that are shared across the site
 *
 * @see {@link "../../data/metadata.ts"} - Source of these values
 */
export const BASE_METADATA: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION_SHORT,
  metadataBase: new URL(siteMetadata.site.url),
  twitter: {
    card: 'summary_large_image',
    site: siteMetadata.social.twitter,
    creator: siteMetadata.social.twitter,
  },
  alternates: {
    canonical: 'https://williamcallahan.com',
  },
  authors: [{
    name: siteMetadata.author,
    url: siteMetadata.site.url,
  }],
  creator: siteMetadata.author,
  publisher: siteMetadata.article.publisher,
  formatDetection: {
    telephone: false,
    date: false,
    address: false,
    email: true,
  },
};

/**
 * Creates JSON-LD structured data for an article
 * @see {@link "https://schema.org/Article"} - Schema.org Article specification
 */
function createArticleSchema({
  title,
  description,
  url,
  image,
  datePublished,
  dateModified,
}: ArticleParams): ArticleSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    datePublished: formatSeoDate(datePublished),
    dateModified: formatSeoDate(dateModified),
    author: {
      '@type': 'Person',
      name: siteMetadata.author,
      url: siteMetadata.site.url,
    },
    publisher: {
      '@type': 'Organization',
      name: siteMetadata.article.publisher,
      logo: {
        '@type': 'ImageObject',
        url: ensureAbsoluteUrl(siteMetadata.defaultImage.url),
      },
    },
    ...(image && {
      image: {
        '@type': 'ImageObject',
        url: ensureAbsoluteUrl(image),
      },
    }),
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
  };
}

/**
 * Creates metadata for article pages
 * Handles browser tab title and delegates OpenGraph metadata to opengraph.ts
 *
 * @param {ArticleParams} params - Article metadata parameters
 * @returns {ArticleMetadata} Next.js metadata object for the article page
 * @see {@link "./opengraph.ts"} - For OpenGraph metadata generation
 * @see {@link "https://ogp.me/#type_article"} - OpenGraph article specification
 */
export function createArticleMetadata({
  title,
  description,
  url,
  image,
  datePublished,
  dateModified,
  tags,
}: ArticleParams): ArticleMetadata {
  // Format dates in Pacific Time with proper offset
  const formattedPublished = formatSeoDate(datePublished);
  const formattedModified = formatSeoDate(dateModified);

  const browserTitle = `${title} - ${SITE_NAME}'s Blog`;

  const articleSchema = createArticleSchema({
    title,
    description,
    url,
    image,
    datePublished,
    dateModified,
  });

  return {
    title: browserTitle,
    description,
    alternates: {
      canonical: url,
      types: {
        'application/ld+json': JSON.stringify(articleSchema),
      },
    },
    openGraph: createArticleOgMetadata({
      title,
      description,
      url,
      image,
      datePublished,
      dateModified,
      tags,
    }),
    twitter: {
      card: 'summary_large_image',
      site: siteMetadata.social.twitter,
      creator: siteMetadata.social.twitter,
      title,
      description,
    },
    other: {
      [SEO_DATE_FIELDS.meta.modified]: formattedModified,
      [SEO_DATE_FIELDS.meta.published]: formattedPublished,
    },
  };
}

/**
 * Get metadata for a static page
 * Includes last-modified date for SEO
 *
 * @param {string} path - The path of the page (e.g., "/", "/blog")
 * @param {Metadata} metadata - Additional metadata to merge with base metadata
 * @returns {Metadata} Next.js metadata object for the page
 */
export function getStaticPageMetadata(path: string, metadata?: Metadata): Metadata {
  // Always use production URL for canonical URLs
  const url = `https://williamcallahan.com${path}`;
  const lastModified = formatSeoDate(new Date());

  return {
    ...BASE_METADATA,
    ...metadata,
    alternates: {
      canonical: url,
    },
    openGraph: {
      ...(metadata?.openGraph || {}),
      url,
    },
    other: {
      [SEO_DATE_FIELDS.meta.modified]: lastModified,
    },
  };
}
