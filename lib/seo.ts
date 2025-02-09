import type { BaseSEOMetadata, SEOMetadata, ImageSEOMetadata, OpenGraphImage } from '../types/seo';
import type { BlogPost } from '../types/blog';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NEXT_PUBLIC_SITE_URL } from './constants';

/**
 * Ensure a URL is absolute
 * @param url - The URL to check and potentially convert
 * @returns The absolute URL
 */
export function ensureAbsoluteUrl(url: string): string {
  if (url.startsWith('http')) return url;
  return `${NEXT_PUBLIC_SITE_URL}${url.startsWith('/') ? url : `/${url}`}`;
}

/**
 * Create structured OpenGraph image metadata
 * @param url - The image URL
 * @param alt - Alt text for the image
 * @returns OpenGraph image metadata
 */
function createOpenGraphImage(url: string, alt: string = ''): OpenGraphImage {
  return {
    url: ensureAbsoluteUrl(url),
    width: 1200,  // Default OG image width
    height: 630,  // Default OG image height
    alt,
    type: url.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg',
  };
}

/**
 * Default site metadata
 */
export const DEFAULT_METADATA: BaseSEOMetadata = {
  title: 'William Callahan - Finance, Startups, & Engineering - San Francisco',
  description: 'Website for William Callahan, a startup investor and Techstars founder, with a public journal of all startup investments he\'s ever made. Writes about technology, programming, Y Combinator, Techstars, and other accelerators, AI, and more.',
  openGraph: {
    title: 'William Callahan - Finance, Startups, & Engineering - San Francisco',
    description: 'Website for William Callahan, a startup investor and Techstars founder, with a public journal of all startup investments he\'s ever made. Writes about technology, programming, Y Combinator, Techstars, and other accelerators, AI, and more.',
    type: 'website',
    url: NEXT_PUBLIC_SITE_URL,
    image: {
      url: ensureAbsoluteUrl('/images/posts/npm_terminal.svg'),
      width: 1200,
      height: 630,
      alt: 'William Callahan',
      type: 'image/svg+xml',
    },
    locale: 'en_US',
    siteName: 'William Callahan',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@williamcallahan',
    title: 'William Callahan - Finance, Startups, & Engineering - San Francisco',
    description: 'Website for William Callahan, a startup investor and Techstars founder, with a public journal of all startup investments he\'s ever made. Writes about technology, programming, Y Combinator, Techstars, and other accelerators, AI, and more.',
    image: ensureAbsoluteUrl('/images/posts/npm_terminal.svg'),
    imageAlt: 'William Callahan',
  },
};

/**
 * Static page metadata configurations
 */
export const STATIC_PAGE_METADATA: Record<string, BaseSEOMetadata> = {
  '/': {
    ...DEFAULT_METADATA,
    canonical: `${NEXT_PUBLIC_SITE_URL}/`,
  },
  '/experience': {
    title: 'Professional Experience - William Callahan',
    description: 'Explore William Callahan\'s professional experience, including roles in software engineering, entrepreneurship, and technology leadership.',
    openGraph: {
      title: 'William Callahan - Professional Experience',
      description: 'Professional experience and career highlights of William Callahan',
      type: 'profile',
      url: `${NEXT_PUBLIC_SITE_URL}/experience`,
      image: DEFAULT_METADATA.openGraph?.image || '',
      locale: 'en_US',
      siteName: 'William Callahan',
    },
    twitter: {
      card: 'summary',
      site: '@williamcallahan',
      title: 'William Callahan - Professional Experience',
      description: 'Professional experience and career highlights of William Callahan',
      image: DEFAULT_METADATA.twitter?.image,
    },
  },
  '/education': {
    title: 'Education Background - William Callahan',
    description: 'Learn about William Callahan\'s educational background, including academic achievements and professional certifications.',
    openGraph: {
      title: 'William Callahan - Education',
      description: 'Educational background and academic achievements of William Callahan',
      type: 'profile',
      url: `${NEXT_PUBLIC_SITE_URL}/education`,
      image: DEFAULT_METADATA.openGraph?.image || '',
      locale: 'en_US',
      siteName: 'William Callahan',
    },
    twitter: {
      card: 'summary',
      site: '@williamcallahan',
      title: 'William Callahan - Education',
      description: 'Educational background and academic achievements of William Callahan',
      image: DEFAULT_METADATA.twitter?.image,
    },
  },
  '/investments': {
    title: 'Investment Portfolio - William Callahan',
    description: 'View William Callahan\'s investment portfolio, including ventures, startups, and technology investments.',
    openGraph: {
      title: 'William Callahan - Investments',
      description: 'Investment portfolio and venture activities of William Callahan',
      type: 'profile',
      url: `${NEXT_PUBLIC_SITE_URL}/investments`,
      image: DEFAULT_METADATA.openGraph?.image || '',
      locale: 'en_US',
      siteName: 'William Callahan',
    },
    twitter: {
      card: 'summary',
      site: '@williamcallahan',
      title: 'William Callahan - Investments',
      description: 'Investment portfolio and venture activities of William Callahan',
      image: DEFAULT_METADATA.twitter?.image,
    },
  },
};

/**
 * Get the canonical URL for a given path
 * @param path - The path to generate the canonical URL for
 * @returns The full canonical URL
 */
export function getCanonicalUrl(path: string): string {
  return `${NEXT_PUBLIC_SITE_URL}${path}`;
}

/**
 * Get metadata for a static page
 * @param path - The page path
 * @returns The page metadata
 */
export function getStaticPageMetadata(path: string): BaseSEOMetadata {
  const metadata = STATIC_PAGE_METADATA[path] || DEFAULT_METADATA;
  const processedMetadata = {
    ...metadata,
    canonical: getCanonicalUrl(path),
    openGraph: metadata.openGraph && {
      ...metadata.openGraph,
      url: getCanonicalUrl(path),
      image: typeof metadata.openGraph.image === 'string'
        ? ensureAbsoluteUrl(metadata.openGraph.image)
        : {
            ...metadata.openGraph.image,
            url: ensureAbsoluteUrl(metadata.openGraph.image.url),
          },
    },
    twitter: metadata.twitter && {
      ...metadata.twitter,
      image: metadata.twitter.image ? ensureAbsoluteUrl(metadata.twitter.image) : undefined,
    },
  };

  return processedMetadata;
}

/**
 * Get metadata for a blog post
 * @param post - The blog post
 * @returns The post metadata with dates
 */
export function getBlogPostMetadata(post: BlogPost): SEOMetadata {
  const { title, excerpt, slug, publishedAt, updatedAt, coverImage, author, tags } = post;
  const canonicalUrl = `${NEXT_PUBLIC_SITE_URL}/blog/${slug}`;
  const imageUrl = coverImage || '/images/posts/npm_terminal.svg';
  const dateModified = updatedAt || publishedAt;

  const ogImage: OpenGraphImage = {
    url: ensureAbsoluteUrl(imageUrl),
    width: 1200,
    height: 630,
    alt: title,
    type: imageUrl.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg',
  };

  return {
    title: `${title} - William Callahan's Blog`,
    description: excerpt,
    canonical: canonicalUrl,
    datePublished: publishedAt,
    dateModified,
    openGraph: {
      title,
      description: excerpt,
      type: 'article',
      image: ogImage,
      url: canonicalUrl,
      locale: 'en_US',
      siteName: 'William Callahan',
      article: {
        publishedTime: publishedAt,
        modifiedTime: dateModified,
        authors: [author.name],
        section: tags[0] || 'Blog',
        tags,
      },
    },
    twitter: {
      card: 'summary_large_image',
      site: '@williamcallahan',
      creator: '@williamcallahan',
      title,
      description: excerpt,
      image: ensureAbsoluteUrl(imageUrl),
      imageAlt: title,
    },
    linkedin: {
      title,
      description: excerpt,
      image: ensureAbsoluteUrl(imageUrl),
      type: 'article',
      'article:author': author.name,
      'article:published_time': publishedAt,
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
    url: ensureAbsoluteUrl(image),
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

Sitemap: ${NEXT_PUBLIC_SITE_URL}/sitemap.xml
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
