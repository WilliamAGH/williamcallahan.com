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

/**
 * Open Graph metadata interface
 * @see https://ogp.me/
 */
export interface OpenGraphMetadata {
  /** The title of your object as it should appear within the graph */
  title: string;
  /** A brief description of the content */
  description: string;
  /** The type of your object. Defaults to 'website' */
  type?: 'website' | 'article' | 'profile';
  /** An image URL which should represent your object within the graph */
  image?: string;
  /** The canonical URL of your object that will be used as its permanent ID in the graph */
  url?: string;
}

/**
 * Twitter Card metadata interface
 * @see https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/markup
 */
export interface TwitterMetadata {
  /** The type of Twitter Card */
  card: 'summary' | 'summary_large_image';
  /** @username of website (twitter:site) */
  site: string;
  /** @username of content creator (twitter:creator) */
  creator?: string;
  /** Title of content (twitter:title) */
  title: string;
  /** Description of content (twitter:description) */
  description: string;
  /** Image URL (twitter:image) */
  image?: string;
  /** Image alt text (twitter:image:alt) */
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
