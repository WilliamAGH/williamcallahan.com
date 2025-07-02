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
 * @recommended Keep under 80 characters for optimal display in search results
 */
export const SITE_TITLE = "William Callahan - Startups, Engineering, & Finance - San Francisco";

/**
 * Shorter title optimized for OpenGraph (under 60 characters)
 */
export const SITE_TITLE_SHORT = "William Callahan - Finance, Startups, & Engineering";

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
 * OpenGraph-optimized description (under 160 characters)
 */
export const SITE_DESCRIPTION_OG =
  "Startup investor & Techstars founder sharing insights on technology, programming, Y Combinator, accelerators, and investment portfolio.";

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

// -------- Auto-sized static OG assets (import exposes src/width/height) --------
// We still import the files to obtain their intrinsic dimensions, but we will expose
// *stable* public URLs ("/images/og/*.png") in SEO metadata to avoid hashed paths
// that third-party scrapers (Twitter, Facebook) refuse to fetch.

import ogDefaultImage from "/images/og/default-og.png";
import ogBookmarksImage from "/images/og/bookmarks-og.png";
import ogProjectsImage from "/images/og/projects-og.png";
import ogBlogIndexImage from "/images/og/blog-og.png";
import ogExperienceImage from "/images/og/experience-og.png";
import ogEducationImage from "/images/og/education-og.png";
import ogInvestmentsImage from "/images/og/investments-og.png";
import ogContactImage from "/images/og/contact-og.png";
import androidLogo512Image from "/images/favicons/android-chrome-512x512.png";

// Map *both* hashed build paths (ogXImage.src) and the stable public paths so that
// width/height look-ups work regardless of which path the caller provides.

export const LOCAL_OG_ASSETS = {
  // Stable public paths
  "/images/og/default-og.png": ogDefaultImage,
  "/images/og/bookmarks-og.png": ogBookmarksImage,
  "/images/og/projects-og.png": ogProjectsImage,
  "/images/og/blog-og.png": ogBlogIndexImage,
  "/images/og/experience-og.png": ogExperienceImage,
  "/images/og/education-og.png": ogEducationImage,
  "/images/og/investments-og.png": ogInvestmentsImage,
  "/images/og/contact-og.png": ogContactImage,
  "/images/favicons/android-chrome-512x512.png": androidLogo512Image,
  // Next.js hashed paths (retained for internal use)
  [ogDefaultImage.src]: ogDefaultImage,
  [ogBookmarksImage.src]: ogBookmarksImage,
  [ogProjectsImage.src]: ogProjectsImage,
  [ogBlogIndexImage.src]: ogBlogIndexImage,
  [ogExperienceImage.src]: ogExperienceImage,
  [ogEducationImage.src]: ogEducationImage,
  [ogInvestmentsImage.src]: ogInvestmentsImage,
  [ogContactImage.src]: ogContactImage,
  [androidLogo512Image.src]: androidLogo512Image,
} as const;

/**
 * Page-specific metadata configurations
 * @see {@link "https://schema.org/dateModified"} - Update dateModified whenever page content changes
 * @see {@link "https://schema.org/dateCreated"} - The date each page was first published
 */
export const SEO_IMAGES = {
  /** Site-wide default OpenGraph/Twitter image */
  ogDefault: "/images/og/default-og.png",
  /** Stand-alone logo card (optional) */
  ogLogo: "/images/favicons/android-chrome-512x512.png",
  /** Collection pages */
  ogBookmarks: "/images/og/bookmarks-og.png",
  ogProjects: "/images/og/projects-og.png",
  ogBlogIndex: "/images/og/blog-og.png",
  /** Static pages */
  ogExperience: "/images/og/experience-og.png",
  ogEducation: "/images/og/education-og.png",
  ogInvestments: "/images/og/investments-og.png",
  ogContact: "/images/og/contact-og.png",
  /** Fallback for dynamic /api/og-image route */
  ogDynamicFallback: "/images/og/default-og.png",
  /** Favicons & touch icons */
  faviconIco: "/images/favicons/favicon.ico",
  appleTouch: "/images/favicons/apple-180x180-touch-icon.png",
  android192: "/images/favicons/android-chrome-192x192.png",
  android512: "/images/favicons/android-chrome-512x512.png",
} as const;

export const PAGE_METADATA = {
  home: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION_OG,
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

/**
 * Shared OpenGraph image dimensions
 * legacy → 1.91:1 ratio (1440×756) used by historical images & dynamic routes
 * modern → Larger 2100×1100 image used going forward when intentionally generated
 */
export const OG_IMAGE_DIMENSIONS = {
  legacy: {
    width: 1440 as const,
    height: 756 as const,
  },
  modern: {
    width: 2100 as const,
    height: 1100 as const,
  },
} as const;

/**
 * Map each static page key to the OG image aspect it should use.
 * This ensures a single place to change sizing decisions without scattering
 * magic numbers throughout the codebase.
 */
export const PAGE_OG_ASPECT: Record<keyof typeof PAGE_METADATA, keyof typeof OG_IMAGE_DIMENSIONS> = {
  home: "legacy",
  experience: "legacy",
  investments: "modern",
  education: "legacy",
  bookmarks: "legacy", // collection page keeps legacy (1440×900 asset fits 1.91:1)
  blog: "legacy",
  projects: "modern",
  contact: "legacy",
} as const;

/**
 * Fallback dimensions for OpenGraph images when Next.js imports don't provide them
 * Maps image URLs to their actual dimensions
 */
export const OG_IMAGE_FALLBACK_DIMENSIONS = {
  "/images/og/default-og.png": { width: 2100, height: 1100 },
  "/images/og/bookmarks-og.png": { width: 2100, height: 1100 },
  "/images/og/projects-og.png": { width: 2100, height: 1100 },
  "/images/og/blog-og.png": { width: 2100, height: 1100 },
  "/images/og/experience-og.png": { width: 2100, height: 1100 },
  "/images/og/education-og.png": { width: 2100, height: 1100 },
  "/images/og/investments-og.png": { width: 2100, height: 1100 },
  "/images/og/contact-og.png": { width: 2100, height: 1100 },
  "/images/favicons/android-chrome-512x512.png": { width: 512, height: 512 },
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
    width: OG_IMAGE_FALLBACK_DIMENSIONS[SEO_IMAGES.ogDefault].width,
    height: OG_IMAGE_FALLBACK_DIMENSIONS[SEO_IMAGES.ogDefault].height,
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
        width: 2100,
        height: 1100,
        alt: `${SITE_NAME} – default social image`,
        type: "image/png",
      },
    ],
  },
};
