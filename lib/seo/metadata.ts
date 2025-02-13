// lib/seo/metadata.ts

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
import {
  SITE_TITLE,
  SITE_DESCRIPTION_SHORT,
  SITE_NAME,
  metadata as siteMetadata,
  PAGE_METADATA
} from '../../data/metadata';
import { SEO_DATE_FIELDS, type ArticleParams } from './constants';
import { formatSeoDate, ensureAbsoluteUrl } from './utils';
import { createArticleOgMetadata } from './opengraph';
import { generateSchemaGraph } from './schema';
import type { ArticleMetadata, ExtendedMetadata } from '../../types/seo';
import type { SchemaParams } from '../../types/seo/schema';
import type { ExtendedOpenGraph } from '../../types/seo/opengraph';

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
    address: false,
    email: true,
  },
};

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
  articleBody = 'Article content not available',
}: ArticleParams): ArticleMetadata {
  // Always include timezone for all dates
  const publishedTime = formatSeoDate(datePublished, true);
  const modifiedTime = formatSeoDate(dateModified, true);

  const browserTitle = `${title} - ${SITE_NAME}'s Blog`;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    articleBody,
    datePublished: publishedTime,
    dateModified: modifiedTime,
    keywords: tags,
    author: {
      '@type': 'Person',
      name: SITE_NAME,
      url: siteMetadata.site.url
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url
    }
  };

  return {
    title: browserTitle,
    description,
    alternates: {
      canonical: url,
    },
    script: [{
      type: 'application/ld+json',
      text: JSON.stringify(schema, null, process.env.NODE_ENV === 'development' ? 2 : 0),
    }],
    openGraph: createArticleOgMetadata({
      title,
      description,
      url,
      image,
      datePublished: publishedTime,
      dateModified: modifiedTime,
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
      // Standard HTML meta dates
      [SEO_DATE_FIELDS.meta.published]: publishedTime,
      [SEO_DATE_FIELDS.meta.modified]: modifiedTime,

      // Optional Dublin Core dates
      [SEO_DATE_FIELDS.dublinCore.created]: publishedTime,
      [SEO_DATE_FIELDS.dublinCore.modified]: modifiedTime,
      [SEO_DATE_FIELDS.dublinCore.issued]: publishedTime,

      // OpenGraph article dates (as meta properties)
      [`property=${SEO_DATE_FIELDS.openGraph.published}`]: publishedTime,
      [`property=${SEO_DATE_FIELDS.openGraph.modified}`]: modifiedTime,
      [`name=${SEO_DATE_FIELDS.openGraph.published}`]: publishedTime,
      [`name=${SEO_DATE_FIELDS.openGraph.modified}`]: modifiedTime,
    },
  };
}

/**
 * Get metadata for a static page
 * Includes published and modified dates for SEO
 *
 * @param {string} path - The path of the page (e.g., "/", "/blog")
 * @param {keyof typeof PAGE_METADATA} pageKey - The key for the page's metadata in PAGE_METADATA
 * @param {object} overrides - Optional overrides for the page's metadata
 * @returns {ExtendedMetadata} Next.js metadata object for the page
 */
export function getStaticPageMetadata(
  path: string,
  pageKey: keyof typeof PAGE_METADATA,
  overrides?: {
    title?: string;
    description?: string;
    breadcrumbs?: Array<{ path: string; name: string; }>;
  }
): ExtendedMetadata {
  const pageMetadata = PAGE_METADATA[pageKey];
  // Always include timezone for all dates
  const dateCreated = formatSeoDate(pageMetadata.dateCreated, true);
  const dateModified = formatSeoDate(pageMetadata.dateModified, true);

  // Determine page type and breadcrumbs
  const isProfilePage = ['home', 'experience', 'education'].includes(pageKey);
  const isCollectionPage = ['blog', 'investments', 'bookmarks', 'blogTag'].includes(pageKey);
  const isDatasetPage = pageKey === 'investments';

  const breadcrumbs = overrides?.breadcrumbs ?? (path === '/' ? undefined : [
    { path: '/', name: 'Home' },
    { path, name: overrides?.title ?? pageMetadata.title },
  ]);

  // Generate schema graph
  const schemaParams: SchemaParams = {
    path,
    title: overrides?.title ?? pageMetadata.title,
    description: overrides?.description ?? pageMetadata.description,
    datePublished: dateCreated,
    dateModified: dateModified,
    type: isProfilePage ? 'profile' : isDatasetPage ? 'dataset' : isCollectionPage ? 'collection' : undefined,
    breadcrumbs,
    image: {
      url: siteMetadata.defaultImage.url,
      width: siteMetadata.defaultImage.width,
      height: siteMetadata.defaultImage.height,
    },
  };

  const schema = generateSchemaGraph(schemaParams);

  const openGraph: ExtendedOpenGraph = isProfilePage
    ? {
        title: overrides?.title ?? pageMetadata.title,
        description: overrides?.description ?? pageMetadata.description,
        type: 'profile',
        url: ensureAbsoluteUrl(path),
        images: [siteMetadata.defaultImage],
        siteName: SITE_NAME,
        locale: 'en_US',
        firstName: SITE_NAME.split(' ')[0],
        lastName: SITE_NAME.split(' ')[1],
        username: siteMetadata.social.twitter.replace('@', ''),
      }
    : pageKey === 'blog'
    ? {
        title: overrides?.title ?? pageMetadata.title,
        description: overrides?.description ?? pageMetadata.description,
        type: 'article',
        url: ensureAbsoluteUrl(path),
        images: [siteMetadata.defaultImage],
        siteName: SITE_NAME,
        locale: 'en_US',
        article: {
          publishedTime: dateCreated,
          modifiedTime: dateModified,
          authors: [siteMetadata.author],
          section: siteMetadata.article.section,
          tags: [],
        },
      }
    : isCollectionPage
    ? {
        title: overrides?.title ?? pageMetadata.title,
        description: overrides?.description ?? pageMetadata.description,
        type: 'website',
        url: ensureAbsoluteUrl(path),
        images: [siteMetadata.defaultImage],
        siteName: SITE_NAME,
        locale: 'en_US',
      }
    : {
        title: overrides?.title ?? pageMetadata.title,
        description: overrides?.description ?? pageMetadata.description,
        type: 'article',
        url: ensureAbsoluteUrl(path),
        images: [siteMetadata.defaultImage],
        siteName: SITE_NAME,
        locale: 'en_US',
        article: {
          publishedTime: dateCreated,
          modifiedTime: dateModified,
          authors: [siteMetadata.author],
          section: siteMetadata.article.section,
          tags: [],
        },
      };

  return {
    ...BASE_METADATA,
    title: overrides?.title ?? pageMetadata.title,
    description: overrides?.description ?? pageMetadata.description,
    alternates: {
      canonical: ensureAbsoluteUrl(path),
    },
    script: [{
      type: 'application/ld+json',
      text: JSON.stringify(schema, null, process.env.NODE_ENV === 'development' ? 2 : 0),
    }],
    openGraph,
    twitter: {
      card: 'summary',
      title: overrides?.title ?? pageMetadata.title,
      description: overrides?.description ?? pageMetadata.description,
      images: [siteMetadata.defaultImage],
      creator: siteMetadata.social.twitter,
    },
    other: {
      // Standard HTML meta dates
      [SEO_DATE_FIELDS.meta.published]: dateCreated,
      [SEO_DATE_FIELDS.meta.modified]: dateModified,

      // Optional Dublin Core dates
      [SEO_DATE_FIELDS.dublinCore.created]: dateCreated,
      [SEO_DATE_FIELDS.dublinCore.modified]: dateModified,
      [SEO_DATE_FIELDS.dublinCore.issued]: dateCreated,

      // OpenGraph article dates (as meta properties)
      [`property=${SEO_DATE_FIELDS.openGraph.published}`]: dateCreated,
      [`property=${SEO_DATE_FIELDS.openGraph.modified}`]: dateModified,
      [`name=${SEO_DATE_FIELDS.openGraph.published}`]: dateCreated,
      [`name=${SEO_DATE_FIELDS.openGraph.modified}`]: dateModified,
    },
    // Add bookmarks metadata for relevant pages
    ...(pageKey === 'bookmarks' && {
      bookmarks: [], // Will be populated with actual bookmarks
      category: 'Resources',
    }),
  };
}
