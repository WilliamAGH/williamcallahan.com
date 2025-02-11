/**
 * Core SEO Implementation
 * @module lib/seo
 * @description
 * Central module for generating SEO metadata across the site.
 * Handles metadata generation for static pages, blog posts, and images.
 *
 * @see {@link "./constants.ts"} - SEO constants and field names
 * @see {@link "./metadata.ts"} - Metadata generation
 * @see {@link "./opengraph.ts"} - OpenGraph implementation
 */

import { SITE_TITLE, SITE_DESCRIPTION, SITE_NAME, metadata } from '../../data/metadata';
import { createArticleOgMetadata } from './opengraph';
import { ensureAbsoluteUrl } from './utils';
import type { Metadata as NextMetadata } from 'next';
import type { BlogPost } from '../../types/blog';
import type { ImageSEOMetadata, OpenGraphImage } from '../../types/seo';

/**
 * Default metadata for all pages
 * @see {@link "../../data/metadata.ts"} - Source of metadata values
 */
export const DEFAULT_METADATA: NextMetadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: metadata.openGraph,
};

/**
 * Static page metadata mapping
 * Provides pre-configured metadata for known static pages
 */
export const STATIC_PAGE_METADATA: Record<string, NextMetadata> = {
  '/': DEFAULT_METADATA,
  '/blog': {
    ...DEFAULT_METADATA,
    title: `Blog - ${SITE_TITLE}`,
  },
  '/experience': {
    ...DEFAULT_METADATA,
    title: `Experience - ${SITE_TITLE}`,
  },
};

/**
 * Get the canonical URL for a given path
 * @param path - The path to get the canonical URL for
 * @returns The full canonical URL
 */
export function getCanonicalUrl(path: string): string {
  return `https://williamcallahan.com${path}`;
}

/**
 * Get metadata for a static page
 * @param path - The page path
 * @returns Metadata object for the page
 */
export function getStaticPageMetadata(path: string): NextMetadata {
  const url = getCanonicalUrl(path);
  const pageMetadata = STATIC_PAGE_METADATA[path] || DEFAULT_METADATA;

  return {
    ...pageMetadata,
    alternates: {
      canonical: url,
    },
    openGraph: pageMetadata.openGraph && {
      ...pageMetadata.openGraph,
      url,
    },
  };
}

/**
 * Get metadata for a blog post
 * Includes OpenGraph article metadata and proper date formatting
 * @param post - The blog post to generate metadata for
 * @returns Complete metadata object for the post
 */
export function getBlogPostMetadata(post: BlogPost): NextMetadata {
  const url = getCanonicalUrl(`/blog/${post.slug}`);
  const ogMetadata = createArticleOgMetadata({
    title: post.title,
    description: post.excerpt,
    url,
    image: post.coverImage,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt || post.publishedAt,
    tags: post.tags,
  });

  // Extract the first image from OpenGraph metadata
  const ogImage = (ogMetadata.images as OpenGraphImage[])?.[0];

  return {
    title: `${post.title} - ${SITE_NAME}'s Blog`,
    description: post.excerpt,
    alternates: {
      canonical: url,
    },
    openGraph: ogMetadata,
    twitter: {
      card: 'summary_large_image',
      site: metadata.social.twitter,
      creator: metadata.social.twitter,
      title: post.title,
      description: post.excerpt,
      images: [{
        url: ogImage?.url ?? metadata.defaultImage.url,
        alt: post.title,
      }],
    },
  };
}

/**
 * Get metadata for an image
 * Combines OpenGraph and Schema.org image metadata
 * @param url - The image URL
 * @param alt - Alt text for the image
 * @param title - Title for the image
 * @returns Combined image metadata object
 */
export function getImageMetadata(
  url: string,
  alt: string,
  title: string
): ImageSEOMetadata {
  const absoluteUrl = ensureAbsoluteUrl(url);

  return {
    url: absoluteUrl,
    alt,
    title,
    openGraph: {
      url: absoluteUrl,
      alt,
      type: url.endsWith('.svg') ? 'image/svg+xml' : undefined,
    },
    schema: {
      '@type': 'ImageObject',
      url: absoluteUrl,
      caption: title,
    },
  };
}

/**
 * Generate robots.txt content
 * @returns robots.txt file content
 */
export function generateRobotsTxt(): string {
  return `User-agent: *\nAllow: /\n\nSitemap: https://williamcallahan.com/sitemap.xml`;
}

/**
 * Generate sitemap XML content
 * @param urls - Array of URLs and their last modified dates
 * @returns Sitemap XML content
 */
export function generateSitemap(urls: Array<{ path: string; lastmod?: string }>): string {
  const urlElements = urls
    .map(({ path, lastmod }) => {
      const loc = getCanonicalUrl(path);
      return `
        <url>
          <loc>${loc}</loc>
          ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
          <changefreq>weekly</changefreq>
        </url>
      `;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      ${urlElements}
    </urlset>`;
}
