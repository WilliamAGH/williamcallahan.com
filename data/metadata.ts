/**
 * Site Metadata Configuration
 * @module data/metadata
 * @description
 * Central configuration file that defines all core metadata values used throughout the site.
 * These values are consumed by the SEO implementation to generate metadata in multiple formats:
 * - HTML meta tags
 * - OpenGraph tags
 * - Schema.org JSON-LD
 * - Twitter Cards
 *
 * This file serves as the SINGLE SOURCE OF TRUTH for all metadata values, ensuring
 * consistency across all SEO implementations.
 *
 * @see {@link "../lib/seo/metadata.ts"} - For general metadata generation
 * @see {@link "../lib/seo/opengraph.ts"} - For OpenGraph-specific metadata generation
 * @see {@link "https://ogp.me"} - OpenGraph protocol specification
 * @see {@link "https://schema.org"} - Schema.org specification
 * @see {@link "https://developer.twitter.com/en/docs/twitter-for-websites/cards"} - Twitter Cards
 */

// Core constants - defined ONCE and used everywhere
/**
 * Site name - used for author attribution and page titles
 * @example "Article Name - William Callahan"
 */
export const SITE_NAME = 'William Callahan';

/**
 * Full site title - used in main page and SEO
 * @recommended Keep under 60 characters for optimal display in search results
 */
export const SITE_TITLE = 'William Callahan - Finance, Startups, & Engineering - San Francisco';

/**
 * Primary site description
 * @recommended Keep under 160 characters for search results
 */
export const SITE_DESCRIPTION = 'Website for William Callahan, a startup investor and Techstars founder, with a public journal of all startup investments he\'s ever made. Writes about technology, programming, Y Combinator, Techstars, and other accelerators, AI, and more.';

/**
 * Shorter site description for space-constrained platforms
 * @recommended Keep under 65 characters for OpenGraph
 * @recommended Keep under 200 characters for Twitter
 */
export const SITE_DESCRIPTION_SHORT = 'William Callahan\'s personal website - startup investor, Techstars founder, and software engineer writing about technology and startups.';

/**
 * Core site metadata
 * Used to generate all forms of metadata tags (meta, OpenGraph, Schema.org, etc.)
 */
export const metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  shortDescription: SITE_DESCRIPTION_SHORT,
  author: SITE_NAME,
  url: 'https://williamcallahan.com',

  /** Keywords for search engine optimization */
  keywords: [
    'William Callahan',
    'Entrepreneur',
    'Investor',
    'Venture Capital',
    'Technology',
    'Fintech',
    'Portfolio',
    'Investment Management'
  ],

  /** Core site information used across all metadata formats */
  site: {
    name: SITE_NAME,
    url: 'https://williamcallahan.com',
    locale: 'en_US',
  },

  /** Social media profiles and handles */
  social: {
    twitter: '@williamcallahan',
    linkedin: 'williamacallahan',
    github: 'williamcallahan',
    profiles: [
      `https://twitter.com/williamcallahan`,
      `https://github.com/williamcallahan`,
      `https://linkedin.com/in/williamacallahan`
    ]
  },

  /** Article-specific metadata */
  article: {
    section: 'Blog',
    author: SITE_NAME,
    publisher: SITE_NAME
  },

  /** Default image used for social sharing */
  defaultImage: {
    url: '/images/posts/npm_terminal.svg',
    width: 800,
    height: 400,
    alt: `${SITE_NAME} on Finance, Startups, & Engineering in San Francisco`,
    type: 'image/svg+xml'
  },

  /** OpenGraph-specific metadata */
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://williamcallahan.com',
    siteName: SITE_NAME,
    images: [{
      url: 'https://williamcallahan.com/og-image.jpg',
      width: 1200,
      height: 630,
      alt: SITE_NAME
    }]
  }
};
