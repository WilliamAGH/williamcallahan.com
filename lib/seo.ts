import type { BaseSEOMetadata, SEOMetadata, ImageSEOMetadata } from '../types/seo';
import type { BlogPost } from '../types/blog';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { API_BASE_URL } from './constants';

/**
 * Default site metadata
 */
export const DEFAULT_METADATA: BaseSEOMetadata = {
  title: 'William Callahan in San Francisco, CA, USA',
  description: 'The personal and professional website for William Callahan, including a blog, professional background, investments, and more.',
  openGraph: {
    title: 'William Callahan',
    description: 'Personal and professional website of William Callahan',
    type: 'website',
    url: API_BASE_URL,
    image: '/images/William Callahan - San Francisco.jpeg',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@williamcallahan',
    title: 'William Callahan',
    description: 'Personal and professional website of William Callahan',
    image: '/images/William Callahan - San Francisco.jpeg',
  },
};

/**
 * Static page metadata configurations
 */
export const STATIC_PAGE_METADATA: Record<string, BaseSEOMetadata> = {
  '/': {
    ...DEFAULT_METADATA,
    canonical: `${API_BASE_URL}/`,
  },
  '/experience': {
    title: 'Professional Experience - William Callahan',
    description: 'Explore William Callahan\'s professional experience, including roles in software engineering, entrepreneurship, and technology leadership.',
    openGraph: {
      title: 'William Callahan - Professional Experience',
      description: 'Professional experience and career highlights of William Callahan',
      type: 'profile',
    },
    twitter: {
      card: 'summary',
      site: '@williamcallahan',
      title: 'William Callahan - Professional Experience',
      description: 'Professional experience and career highlights of William Callahan',
    },
  },
  '/education': {
    title: 'Education Background - William Callahan',
    description: 'Learn about William Callahan\'s educational background, including academic achievements and professional certifications.',
    openGraph: {
      title: 'William Callahan - Education',
      description: 'Educational background and academic achievements of William Callahan',
      type: 'profile',
    },
    twitter: {
      card: 'summary',
      site: '@williamcallahan',
      title: 'William Callahan - Education',
      description: 'Educational background and academic achievements of William Callahan',
    },
  },
  '/investments': {
    title: 'Investment Portfolio - William Callahan',
    description: 'View William Callahan\'s investment portfolio, including ventures, startups, and technology investments.',
    openGraph: {
      title: 'William Callahan - Investments',
      description: 'Investment portfolio and venture activities of William Callahan',
      type: 'profile',
    },
    twitter: {
      card: 'summary',
      site: '@williamcallahan',
      title: 'William Callahan - Investments',
      description: 'Investment portfolio and venture activities of William Callahan',
    },
  },
};

/**
 * Get the canonical URL for a given path
 * @param path - The path to generate the canonical URL for
 * @returns The full canonical URL
 */
export function getCanonicalUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

/**
 * Get metadata for a static page
 * @param path - The page path
 * @returns The page metadata
 */
export function getStaticPageMetadata(path: string): BaseSEOMetadata {
  const metadata = STATIC_PAGE_METADATA[path] || DEFAULT_METADATA;
  return {
    ...metadata,
    canonical: getCanonicalUrl(path),
  };
}

/**
 * Get metadata for a blog post
 * @param post - The blog post
 * @returns The post metadata with dates
 */
export function getBlogPostMetadata(post: BlogPost): SEOMetadata {
  // Use the MDX file's creation date as published date
  const datePublished = post.publishedAt;
  const dateModified = post.updatedAt || datePublished;

  return {
    title: `${post.title} - William Callahan's Blog`,
    description: post.excerpt,
    canonical: getCanonicalUrl(`/blog/${post.slug}`),
    datePublished,
    dateModified,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      image: post.coverImage,
      url: getCanonicalUrl(`/blog/${post.slug}`),
    },
    twitter: {
      card: 'summary_large_image',
      site: '@williamcallahan',
      title: post.title,
      description: post.excerpt,
      image: post.coverImage?.startsWith('http')
        ? post.coverImage
        : `${API_BASE_URL}${post.coverImage}`,
      creator: '@williamcallahan',
    },
    linkedin: {
      title: post.title,
      description: post.excerpt,
      image: post.coverImage?.startsWith('http')
        ? post.coverImage
        : `${API_BASE_URL}${post.coverImage}`,
      type: 'article',
      'article:author': 'William Callahan',
      'article:published_time': datePublished,
      'article:modified_time': dateModified,
    },
  };
}

/**
 * Get metadata for an image
 * @param image - The image path or URL
 * @param alt - The alt text
 * @param title - The title text
 * @returns The image metadata
 */
export function getImageMetadata(
  image: string,
  alt: string,
  title: string
): ImageSEOMetadata {
  return {
    alt,
    title,
    url: image.startsWith('http') ? image : `${API_BASE_URL}${image}`,
  };
}

/**
 * Generate robots.txt content
 * @returns The robots.txt content
 */
export function generateRobotsTxt(): string {
  return `
User-agent: *
Allow: /

Sitemap: ${API_BASE_URL}/sitemap.xml
`.trim();
}

/**
 * Generate sitemap.xml content
 * @param urls - Array of URL objects with path and lastmod
 * @returns The sitemap XML content
 */
export function generateSitemap(
  urls: Array<{ path: string; lastmod?: string }>
): string {
  const urlElements = urls
    .map(
      ({ path, lastmod }) => `
  <url>
    <loc>${getCanonicalUrl(path)}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>weekly</changefreq>
  </url>`
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlElements}
</urlset>`.trim();
}

/**
 * Get the file creation date
 * @param filePath - Path to the file
 * @returns The creation date as an ISO string
 */
export async function getFileCreationDate(filePath: string): Promise<string> {
  const stats = await fs.stat(filePath);
  return stats.birthtime.toISOString();
}

/**
 * Get the file modification date
 * @param filePath - Path to the file
 * @returns The modification date as an ISO string
 */
export async function getFileModificationDate(filePath: string): Promise<string> {
  const stats = await fs.stat(filePath);
  return stats.mtime.toISOString();
}
