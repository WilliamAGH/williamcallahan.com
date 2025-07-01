/**
 * Core SEO Implementation
 * @module lib/seo
 * @description
 * Central module for generating SEO metadata across the site.
 * Handles metadata generation for static pages, blog posts, and images.
 *
 * @see {@link "@/lib/constants"} - SEO constants and field names
 * @see {@link "./metadata.ts"} - Metadata generation
 * @see {@link "./opengraph.ts"} - OpenGraph implementation
 */

// Re-export SEO constants from main constants file
export { SEO_DATE_FIELDS } from "@/lib/constants";
export * from "./metadata";
export * from "./opengraph";
export * from "./schema";
export * from "./utils";

// Re-export metadata configuration from data
export {
  SITE_NAME,
  SITE_TITLE,
  SITE_DESCRIPTION,
  SITE_DESCRIPTION_SHORT,
  PAGE_METADATA,
  metadata,
} from "../../data/metadata";

// Re-export types only - no runtime values to avoid circular dependencies
export type {
  MetadataConfig,
  ProfilePageMetadata as ValidatedProfilePageMetadata,
  CollectionPageMetadata as ValidatedCollectionPageMetadata,
} from "../../types/seo/metadata";

import type { Metadata as NextMetadata } from "next";
import { SITE_NAME, metadata } from "../../data/metadata";
import type { BlogPost } from "../../types/blog";
import type { ImageSEOMetadata, OpenGraphImage } from "../../types/seo";
import { createArticleOgMetadata } from "./opengraph";
import { ensureAbsoluteUrl } from "./utils";

/**
 * Get the canonical URL for a given path
 * @param path - The path to get the canonical URL for
 * @returns The full canonical URL
 */
export function getCanonicalUrl(path: string): string {
  return `https://williamcallahan.com${path}`;
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
      card: "summary_large_image",
      site: metadata.social.twitter,
      creator: metadata.social.twitter,
      title: post.title,
      description: post.excerpt,
      images: [
        {
          url: ogImage?.url ?? metadata.defaultImage.url,
          alt: post.title,
        },
      ],
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
export function getImageMetadata(url: string, alt: string, title: string): ImageSEOMetadata {
  const absoluteUrl = ensureAbsoluteUrl(url);

  return {
    url: absoluteUrl,
    alt,
    title,
    openGraph: {
      url: absoluteUrl,
      alt,
      type: url.endsWith(".svg") ? "image/svg+xml" : undefined,
    },
    schema: {
      "@type": "ImageObject",
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
  return "User-agent: *\nAllow: /\n\nSitemap: https://williamcallahan.com/sitemap.xml";
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
          ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}
          <changefreq>weekly</changefreq>
        </url>
      `;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      ${urlElements}
    </urlset>`;
}
