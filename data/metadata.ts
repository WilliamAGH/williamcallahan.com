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
export const SITE_NAME = "William Callahan";

/**
 * Full site title - used in main page and SEO
 * @recommended Keep under 60 characters for optimal display in search results
 */
export const SITE_TITLE = "William Callahan - Finance, Startups, & Engineering - San Francisco";

/**
 * Primary site description
 * @recommended Keep under 160 characters for search results
 */
export const SITE_DESCRIPTION =
  "Website for William Callahan, a startup investor and Techstars founder, with a public journal of all startup investments he's ever made. Writes about technology, programming, Y Combinator, Techstars, and other accelerators, AI, and more.";

/**
 * Shorter site description for space-constrained platforms
 * @recommended Keep under 65 characters for OpenGraph
 * @recommended Keep under 200 characters for Twitter
 */
export const SITE_DESCRIPTION_SHORT =
  "William Callahan's personal website - startup investor, Techstars founder, and software engineer writing about technology and startups.";

/**
 * Core site metadata
 * Used to generate all forms of metadata tags (meta, OpenGraph, Schema.org, etc.)
 */
/**
 * Page-specific metadata configurations
 * @see {@link "https://schema.org/dateModified"} - Update dateModified whenever page content changes
 * @see {@link "https://schema.org/dateCreated"} - The date each page was first published
 */
import type { ProfilePageMetadata, CollectionPageMetadata } from "@/types/seo";

/**
 * Page-specific metadata configurations
 * @see {@link "https://schema.org/dateModified"} - Update dateModified whenever page content changes
 * @see {@link "https://schema.org/dateCreated"} - The date each page was first published
 */
export const SEO_IMAGES = {
  /** Site-wide default OpenGraph/Twitter image (1200×630 PNG) */
  ogDefault: "/images/og/default-og.png",
  /** Stand-alone logo card (optional) */
  ogLogo: "/images/favicons/android-chrome-512x512.png",
  /** Collection pages */
  ogBookmarks: "/images/og/bookmarks-og.png",
  ogProjects: "/images/og/projects-og.png",
  ogBlogIndex: "/images/og/blog-og.png",
  /** Fallback for dynamic /api/og-image route */
  ogDynamicFallback: "/images/og/default-og.png", // alias of ogDefault for dynamic route fallback
  /** Favicons & touch icons */
  faviconIco: "/images/favicons/favicon.ico",
  appleTouch: "/images/favicons/apple-180x180-touch-icon.png",
  android192: "/images/favicons/android-chrome-192x192.png",
  android512: "/images/favicons/android-chrome-512x512.png",
} as const;

export const PAGE_METADATA = {
  home: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    dateCreated: "2025-02-10T12:42:00",
    dateModified: "2025-02-10T12:42:00",
    bio: SITE_DESCRIPTION_SHORT,
    interactionStats: {
      follows: 500,
      likes: 1200,
      posts: 85,
    },
    alternateName: "williamcallahan",
    profileImage: "/images/william-callahan-san-francisco.png",
  } as ProfilePageMetadata,
  experience: {
    title: `Professional Experience - ${SITE_NAME}`,
    description: `Explore ${SITE_NAME}'s professional experience, including roles in software engineering, entrepreneurship, and technology leadership.`,
    dateCreated: "2025-02-10T12:42:00",
    dateModified: "2025-02-10T12:42:00",
    bio: "Software engineer, startup investor, and Techstars founder based in San Francisco.",
    interactionStats: {
      follows: 200,
      likes: 350,
      posts: 45,
    },
    alternateName: "williamcallahan",
    profileImage: "/images/william-callahan-san-francisco.png",
  } as ProfilePageMetadata,
  investments: {
    title: `Investment Portfolio - ${SITE_NAME}`,
    description: `View ${SITE_NAME}'s investment portfolio, including ventures, startups, and technology investments.`,
    dateCreated: "2025-02-10T12:42:00",
    dateModified: "2025-02-10T12:42:00",
  } as CollectionPageMetadata,
  education: {
    title: `Education & Certifications - ${SITE_NAME}`,
    description: `Learn about ${SITE_NAME}'s educational background, certifications, and continuous learning journey.`,
    dateCreated: "2025-02-10T12:42:00",
    dateModified: "2025-02-10T12:42:00",
    bio: "Lifelong learner with a focus on technology, finance, and entrepreneurship.",
    interactionStats: {
      follows: 150,
      posts: 15,
    },
    alternateName: "williamcallahan",
    profileImage: "/images/william-callahan-san-francisco.png",
  } as ProfilePageMetadata,
  bookmarks: {
    title: `Bookmarks & Resources - ${SITE_NAME}`,
    description: `An upcoming list and curated collection of ${SITE_NAME}'s favorite resources, articles, and tools.`,
    dateCreated: "2025-02-10T12:42:00",
    dateModified: "2025-02-10T12:42:00",
  } as CollectionPageMetadata,
  blog: {
    title: `Blog - ${SITE_NAME}`,
    description: `Articles and insights from ${SITE_NAME} on technology, startups, and software engineering.`,
    dateCreated: "2025-02-10T12:42:00",
    dateModified: "2025-02-10T12:42:00",
  } as CollectionPageMetadata,
  projects: {
    title: `Project Sandbox - ${SITE_NAME}`, // Changed title
    description: `A selection of projects ${SITE_NAME} has worked on or contributed to.`,
    dateCreated: "2025-04-07T10:11:00",
    dateModified: "2025-04-07T10:58:00", // Update modified date
  } as CollectionPageMetadata,
  contact: {
    title: `Contact & Social Media - ${SITE_NAME}`,
    description: `Connect with ${SITE_NAME} on various social media platforms and professional networks.`,
    dateCreated: "2025-05-03T15:00:00",
    dateModified: "2025-05-03T15:00:00",
  } as CollectionPageMetadata,
} as const;

export const metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  shortDescription: SITE_DESCRIPTION_SHORT,
  author: SITE_NAME,
  url: "https://williamcallahan.com",

  /** Keywords for search engine optimization */
  keywords: [
    "William Callahan",
    "Entrepreneur",
    "Investor",
    "Venture Capital",
    "Technology",
    "Fintech",
    "Portfolio",
    "Investment Management",
  ],

  /** Core site information used across all metadata formats */
  site: {
    name: SITE_NAME,
    url: "https://williamcallahan.com",
    locale: "en_US",
  },

  /** Social media profiles and handles */
  social: {
    twitter: "@williamcallahan",
    linkedin: "williamacallahan",
    github: "WilliamAGH",
    profiles: [
      "https://twitter.com/williamcallahan",
      "https://github.com/williamcallahan",
      "https://linkedin.com/in/williamacallahan",
    ],
  },

  /** Article-specific metadata */
  article: {
    section: "Blog",
    author: SITE_NAME,
    publisher: SITE_NAME,
  },

  /** Default image used for social sharing */
  defaultImage: {
    url: SEO_IMAGES.ogDefault,
    width: 1200,
    height: 630,
    alt: `${SITE_NAME} on Finance, Startups, & Engineering in San Francisco`,
    type: "image/png",
  },

  /** OpenGraph-specific metadata */
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://williamcallahan.com",
    siteName: SITE_NAME,
    images: [
      {
        url: SEO_IMAGES.ogDefault,
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} – default social image`,
        type: "image/png",
      },
    ],
  },
};
