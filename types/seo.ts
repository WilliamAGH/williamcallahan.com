/**
 * Core SEO metadata types for the website
 */

/**
 * LinkedIn metadata interface
 * @see https://www.linkedin.com/help/linkedin/answer/46687/making-your-website-shareable-on-linkedin
 */
export interface LinkedInMetadata {
  /** Title of content */
  title: string;
  /** Description of content */
  description: string;
  /** Image URL */
  image?: string;
  /** Type of content */
  type: 'article';
  /** Article author */
  'article:author': string;
  /** Article published time */
  'article:published_time': string;
  /** Article modified time */
  'article:modified_time': string;
}

/**
 * OpenGraph image metadata interface
 */
export interface OpenGraphImage {
  /** The URL of the image */
  url: string;
  /** The width of the image in pixels */
  width: number;
  /** The height of the image in pixels */
  height: number;
  /** Alternative text for the image */
  alt?: string;
  /** MIME type of the image */
  type: string;
}

/**
 * Article-specific OpenGraph metadata
 * @see https://ogp.me/#type_article
 */
export interface OpenGraphArticle {
  /** When the article was first published (ISO 8601) */
  publishedTime: string;
  /** When the article was last modified (ISO 8601) */
  modifiedTime: string;
  /** When the article will expire (ISO 8601) */
  expirationTime?: string;
  /** Writers of the article */
  authors: string[];
  /** A section of your site to which the article belongs */
  section?: string;
  /** Tag words associated with this article */
  tags?: string[];
}

/**
 * Open Graph metadata interface
 * @see https://ogp.me/
 */
export interface OpenGraphMetadata {
  /** The title of your object as it should appear within the graph */
  title: string;
  /** A brief description of the content (2-4 sentences) */
  description: string;
  /** The type of your object */
  type: 'website' | 'article' | 'profile';
  /** The canonical URL of your object that will be used as its permanent ID in the graph */
  url: string;
  /** An image URL or structured image object which should represent your object within the graph */
  image: string | OpenGraphImage;
  /** The locale these tags are marked up in (format: language_TERRITORY) */
  locale: string;
  /** If your object is part of a larger web site, the name which should be displayed for the overall site */
  siteName: string;
  /** Article-specific metadata, required if type is 'article' */
  article?: OpenGraphArticle;
}

/**
 * Twitter Card metadata interface
 * @see https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/markup
 */
export interface TwitterMetadata {
  /** The type of Twitter Card */
  card: 'summary' | 'summary_large_image';
  /** @username of website */
  site: string;
  /** @username of content creator */
  creator?: string;
  /** Title of content */
  title: string;
  /** Description of content */
  description: string;
  /** Image URL */
  image?: string;
  /** Image alt text */
  imageAlt?: string;
}

/**
 * Image SEO metadata interface
 */
export interface ImageSEOMetadata {
  /** Alt text for the image */
  alt: string;
  /** Title attribute for the image */
  title: string;
  /** URL of the image */
  url: string;
  /** Width of the image */
  width?: number;
  /** Height of the image */
  height?: number;
}

/**
 * Base SEO metadata interface that all pages must implement
 */
export interface BaseSEOMetadata {
  /** Page title - should be unique and descriptive */
  title: string;
  /** Meta description - should be between 150-160 characters */
  description: string;
  /** Canonical URL for the page */
  canonical?: string;
  /** Open Graph specific metadata */
  openGraph?: OpenGraphMetadata;
  /** Twitter specific metadata */
  twitter?: TwitterMetadata;
  /** LinkedIn specific metadata */
  linkedin?: LinkedInMetadata;
}

/**
 * Extended SEO metadata interface that includes dates
 */
export interface SEOMetadata extends BaseSEOMetadata {
  /** Date the content was first published */
  datePublished: string;
  /** Date the content was last modified */
  dateModified: string;
}
