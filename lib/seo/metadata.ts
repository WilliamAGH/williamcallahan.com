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
  // Format dates in Pacific Time with proper offset
  const formattedPublished = formatSeoDate(datePublished);
  const formattedModified = formatSeoDate(dateModified);

  const browserTitle = `${title} - ${SITE_NAME}'s Blog`;

  // Generate schema graph
  const schemaParams: SchemaParams = {
    path: new URL(url).pathname,
    title,
    description,
    datePublished: formattedPublished,
    dateModified: formattedModified,
    type: 'article',
    articleBody,
    keywords: tags,
    image: image ? {
      url: image,
      width: siteMetadata.defaultImage.width,
      height: siteMetadata.defaultImage.height,
    } : undefined,
    breadcrumbs: [
      { path: '/', name: 'Home' },
      { path: '/blog', name: 'Blog' },
      { path: new URL(url).pathname, name: title },
    ],
  };

  const schema = generateSchemaGraph(schemaParams);

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
      // Standard HTML meta dates
      [SEO_DATE_FIELDS.meta.published]: formattedPublished,
      [SEO_DATE_FIELDS.meta.modified]: formattedModified,

      // Optional Dublin Core dates
      [SEO_DATE_FIELDS.dublinCore.created]: formattedPublished,
      [SEO_DATE_FIELDS.dublinCore.modified]: formattedModified,
      [SEO_DATE_FIELDS.dublinCore.issued]: formattedPublished,

      // OpenGraph article dates (as meta properties)
      [`property=${SEO_DATE_FIELDS.openGraph.published}`]: formattedPublished,
      [`property=${SEO_DATE_FIELDS.openGraph.modified}`]: formattedModified,
      [`name=${SEO_DATE_FIELDS.openGraph.published}`]: formattedPublished,
      [`name=${SEO_DATE_FIELDS.openGraph.modified}`]: formattedModified,
    },
  };
}

/**
 * Get metadata for a static page
 * Includes published and modified dates for SEO
 *
 * @param {string} path - The path of the page (e.g., "/", "/blog")
 * @param {keyof typeof PAGE_METADATA} pageKey - The key for the page's metadata in PAGE_METADATA
 * @returns {ExtendedMetadata} Next.js metadata object for the page
 */
export function getStaticPageMetadata(
  path: string,
  pageKey: keyof typeof PAGE_METADATA
): ExtendedMetadata {
  const pageMetadata = PAGE_METADATA[pageKey];
  const formattedCreated = formatSeoDate(pageMetadata.dateCreated);
  const formattedModified = formatSeoDate(pageMetadata.dateModified);

  // Determine page type and breadcrumbs
  const isProfilePage = ['home', 'experience', 'education'].includes(pageKey);
  const isCollectionPage = ['blog', 'investments', 'bookmarks'].includes(pageKey);
  const isDatasetPage = pageKey === 'investments';

  const breadcrumbs = path === '/' ? undefined : [
    { path: '/', name: 'Home' },
    { path, name: pageMetadata.title },
  ];

  // Generate schema graph
  const schemaParams: SchemaParams = {
    path,
    title: pageMetadata.title,
    description: pageMetadata.description,
    datePublished: formattedCreated,
    dateModified: formattedModified,
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
        title: pageMetadata.title,
        description: pageMetadata.description,
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
        title: pageMetadata.title,
        description: pageMetadata.description,
        type: 'article',
        url: ensureAbsoluteUrl(path),
        images: [siteMetadata.defaultImage],
        siteName: SITE_NAME,
        locale: 'en_US',
        article: {
          publishedTime: formattedCreated,
          modifiedTime: formattedModified,
          authors: [siteMetadata.author],
          section: siteMetadata.article.section,
          tags: [],
        },
      }
    : isCollectionPage
    ? {
        title: pageMetadata.title,
        description: pageMetadata.description,
        type: 'website',
        url: ensureAbsoluteUrl(path),
        images: [siteMetadata.defaultImage],
        siteName: SITE_NAME,
        locale: 'en_US',
      }
    : {
        title: pageMetadata.title,
        description: pageMetadata.description,
        type: 'article',
        url: ensureAbsoluteUrl(path),
        images: [siteMetadata.defaultImage],
        siteName: SITE_NAME,
        locale: 'en_US',
        article: {
          publishedTime: formattedCreated,
          modifiedTime: formattedModified,
          authors: [siteMetadata.author],
          section: siteMetadata.article.section,
          tags: [],
        },
      };

  return {
    ...BASE_METADATA,
    title: pageMetadata.title,
    description: pageMetadata.description,
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
      title: pageMetadata.title,
      description: pageMetadata.description,
      images: [siteMetadata.defaultImage],
      creator: siteMetadata.social.twitter,
    },
    other: {
      // Standard HTML meta dates
      [SEO_DATE_FIELDS.meta.published]: formattedCreated,
      [SEO_DATE_FIELDS.meta.modified]: formattedModified,

      // Optional Dublin Core dates
      [SEO_DATE_FIELDS.dublinCore.created]: formattedCreated,
      [SEO_DATE_FIELDS.dublinCore.modified]: formattedModified,
      [SEO_DATE_FIELDS.dublinCore.issued]: formattedCreated,

      // OpenGraph article dates (as meta properties)
      [`property=${SEO_DATE_FIELDS.openGraph.published}`]: formattedCreated,
      [`property=${SEO_DATE_FIELDS.openGraph.modified}`]: formattedModified,
      [`name=${SEO_DATE_FIELDS.openGraph.published}`]: formattedCreated,
      [`name=${SEO_DATE_FIELDS.openGraph.modified}`]: formattedModified,
    },
    // Add bookmarks metadata for relevant pages
    ...(pageKey === 'bookmarks' && {
      bookmarks: [], // Will be populated with actual bookmarks
      category: 'Resources',
    }),
  };
}
