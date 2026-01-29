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

import { getStaticImageUrl } from "@/lib/data-access/static-images";

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
export const SITE_TITLE = "William Callahan - San Francisco";

/**
 * Shorter title optimized for OpenGraph (under 60 characters)
 */
export const SITE_TITLE_SHORT = "William Callahan - San Francisco";

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

import ogDefaultImage from "@/public/images/og/default-og.png";
import ogBookmarksImage from "@/public/images/og/bookmarks-og.png";
import ogProjectsImage from "@/public/images/og/projects-og.png";
import ogBlogIndexImage from "@/public/images/og/blog-og.png";
import ogExperienceImage from "@/public/images/og/experience-og.png";
import ogEducationImage from "@/public/images/og/education-og.png";
import ogInvestmentsImage from "@/public/images/og/investments-og.png";
import ogContactImage from "@/public/images/og/contact-og.png";
import androidLogo512Image from "@/public/images/favicons/android-chrome-512x512.png";

// Map *both* hashed build paths (ogXImage.src) and the stable public paths so that
// width/height look-ups work regardless of which path the caller provides.

export const LOCAL_OG_ASSETS = {
  // Stable public paths
  [getStaticImageUrl("/images/og/default-og.png")]: ogDefaultImage,
  [getStaticImageUrl("/images/og/bookmarks-og.png")]: ogBookmarksImage,
  [getStaticImageUrl("/images/og/projects-og.png")]: ogProjectsImage,
  [getStaticImageUrl("/images/og/blog-og.png")]: ogBlogIndexImage,
  [getStaticImageUrl("/images/og/experience-og.png")]: ogExperienceImage,
  [getStaticImageUrl("/images/og/education-og.png")]: ogEducationImage,
  [getStaticImageUrl("/images/og/investments-og.png")]: ogInvestmentsImage,
  [getStaticImageUrl("/images/og/contact-og.png")]: ogContactImage,
  [getStaticImageUrl("/images/favicons/android-chrome-512x512.png")]: androidLogo512Image,
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
  ogDefault: getStaticImageUrl("/images/og/default-og.png"),
  /** Stand-alone logo card (optional) */
  ogLogo: getStaticImageUrl("/images/favicons/android-chrome-512x512.png"),
  /** Collection pages */
  ogBookmarks: getStaticImageUrl("/images/og/bookmarks-og.png"),
  ogProjects: getStaticImageUrl("/images/og/projects-og.png"),
  ogBlogIndex: getStaticImageUrl("/images/og/blog-og.png"),
  /** Static pages */
  ogExperience: getStaticImageUrl("/images/og/experience-og.png"),
  ogCv: getStaticImageUrl("/images/og/experience-og.png"),
  ogEducation: getStaticImageUrl("/images/og/education-og.png"),
  ogInvestments: getStaticImageUrl("/images/og/investments-og.png"),
  ogContact: getStaticImageUrl("/images/og/contact-og.png"),
  /** Fallback for dynamic /api/og-image route */
  ogDynamicFallback: getStaticImageUrl("/images/og/default-og.png"),
  /** Favicons & touch icons */
  faviconIco: getStaticImageUrl("/images/favicons/favicon.ico"),
  appleTouch: getStaticImageUrl("/images/favicons/apple-180x180-touch-icon.png"),
  android192: getStaticImageUrl("/images/favicons/android-chrome-192x192.png"),
  android512: getStaticImageUrl("/images/favicons/android-chrome-512x512.png"),
} as const;

export const PAGE_METADATA = {
  home: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION_OG,
    dateCreated: "2025-02-10T12:42:00",
    dateModified: "2025-11-04T12:42:00",
    bio: SITE_DESCRIPTION_SHORT,
    interactionStats: {
      follows: 500,
      likes: 1200,
      posts: 85,
    },
    alternateName: "williamcallahan",
    profileImage: getStaticImageUrl("/images/william-callahan-san-francisco.png"),
  } as ProfilePageMetadata,
  experience: {
    title: `Professional Experience - ${SITE_NAME}`,
    description: `Explore ${SITE_NAME}'s professional experience, including roles in software engineering, entrepreneurship, and technology leadership.`,
    dateCreated: "2025-02-10T12:42:00",
    dateModified: "2025-11-07T12:42:00",
    bio: "Software engineer, startup investor, and Techstars founder based in San Francisco.",
    interactionStats: {
      follows: 200,
      likes: 350,
      posts: 45,
    },
    alternateName: "williamcallahan",
    profileImage: getStaticImageUrl("/images/william-callahan-san-francisco.png"),
  } as ProfilePageMetadata,
  cv: {
    title: `Curriculum Vitae - ${SITE_NAME}`,
    description: `${SITE_NAME}'s curriculum vitae, including highlighted experience, education, certifications, and technical capabilities.`,
    dateCreated: "2025-11-07T00:00:00",
    dateModified: "2025-11-07T00:00:00",
    bio: "Investor, founder, and engineer building cloud/web applications in San Francisco.",
    alternateName: "williamcallahan",
    profileImage: getStaticImageUrl("/images/william-callahan-san-francisco.png"),
  } as ProfilePageMetadata,
  investments: {
    title: `Investment Portfolio - ${SITE_NAME}`,
    description: `View ${SITE_NAME}'s investment portfolio, including ventures, startups, and technology investments.`,
    dateCreated: "2025-02-10T12:42:00",
    dateModified: "2025-11-04T12:42:00",
  } as CollectionPageMetadata,
  education: {
    title: `Education & Certifications - ${SITE_NAME}`,
    description: `Learn about ${SITE_NAME}'s educational background, certifications, and continuous learning journey.`,
    dateCreated: "2025-02-10T12:42:00",
    dateModified: "2025-11-04T12:42:00",
    bio: "Lifelong learner with a focus on technology, engineering, and finance.",
    interactionStats: {
      follows: 150,
      posts: 15,
    },
    alternateName: "williamcallahan",
    profileImage: getStaticImageUrl("/images/william-callahan-san-francisco.png"),
  } as ProfilePageMetadata,
  bookmarks: {
    title: `Bookmarks & Resources - ${SITE_NAME}`,
    description:
      "A live updating directory of things online I found noteworthy and wish to refer back to periodically.",
    dateCreated: "2025-02-10T12:42:00",
    dateModified: "2025-11-04T12:42:00",
  } as CollectionPageMetadata,
  blog: {
    title: `Blog - ${SITE_NAME}`,
    description: `Articles and insights from ${SITE_NAME} on technology, startups, and software engineering.`,
    dateCreated: "2025-02-10T12:42:00",
    dateModified: "2025-11-04T12:42:00",
  } as CollectionPageMetadata,
  projects: {
    title: `Projects - ${SITE_NAME}`,
    description: `A selection of projects ${SITE_NAME} has worked on or contributed to.`,
    dateCreated: "2025-04-07T10:11:00",
    dateModified: "2025-11-04T10:58:00",
  } as CollectionPageMetadata,
  contact: {
    title: `Contact & Social Media - ${SITE_NAME}`,
    description: `Connect with ${SITE_NAME} on various social media platforms and professional networks.`,
    dateCreated: "2025-05-03T15:00:00",
    dateModified: "2025-11-04T15:00:00",
  } as CollectionPageMetadata,
  books: {
    title: `Bookshelf (Reading List) - ${SITE_NAME}`,
    description: `Explore ${SITE_NAME}'s personal reading list featuring books and audiobooks on technology, engineering, AI, fiction, finance, research, business, and anything else that interests me.`,
    uiTitle: "Bookshelf (Reading List)",
    uiDescription:
      "A sampling from my personal library of books I've read. I regularly and more recently read primarily from the genres of software engineering, fiction (mystery, science, thriller), AI, finance, and research topics.",
    disclaimer:
      "Note, if this list seems small and shallow, that's because it is! I plan to add additional API sources of my personal libraries, but it's a bit fragmented between several different libraries at the moment (AudioBookShelf, Audible.com, Kindle, and Libby, among others).",
    dateCreated: "2025-12-10T00:00:00",
    dateModified: "2025-12-10T00:00:00",
  } as CollectionPageMetadata,
  thoughts: {
    title: `Thoughts - ${SITE_NAME}`,
    description: `My personal ruminations and thoughts, sometimes fleeting and others retrieved from my long-term memory, that may or may not pass the test of time.`,
    uiTitle: "Notes & Ruminations",
    uiDescription:
      "Some of my fleeting thoughts and learnings that I find helpful to index and organize for later reflection and share with others. Some may pass the test of time, and the others help me improve my knowledge and judgement.",
    dateCreated: "2025-12-10T00:00:00",
    dateModified: "2025-12-10T00:00:00",
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
export const PAGE_OG_ASPECT: Record<keyof typeof PAGE_METADATA, keyof typeof OG_IMAGE_DIMENSIONS> =
  {
    home: "legacy",
    experience: "legacy",
    cv: "legacy",
    investments: "modern",
    education: "legacy",
    bookmarks: "legacy", // collection page keeps legacy (1440×900 asset fits 1.91:1)
    blog: "legacy",
    projects: "modern",
    contact: "legacy",
    books: "modern",
    thoughts: "modern",
  } as const;

/**
 * Fallback dimensions for OpenGraph images when Next.js imports don't provide them
 * Maps image URLs to their actual dimensions
 */
export const OG_IMAGE_FALLBACK_DIMENSIONS = {
  [getStaticImageUrl("/images/og/default-og.png")]: { width: 2100, height: 1100 },
  [getStaticImageUrl("/images/og/bookmarks-og.png")]: { width: 2100, height: 1100 },
  [getStaticImageUrl("/images/og/projects-og.png")]: { width: 2100, height: 1100 },
  [getStaticImageUrl("/images/og/blog-og.png")]: { width: 2100, height: 1100 },
  [getStaticImageUrl("/images/og/experience-og.png")]: { width: 2100, height: 1100 },
  [getStaticImageUrl("/images/og/education-og.png")]: { width: 2100, height: 1100 },
  [getStaticImageUrl("/images/og/investments-og.png")]: { width: 2100, height: 1100 },
  [getStaticImageUrl("/images/og/contact-og.png")]: { width: 2100, height: 1100 },
  [getStaticImageUrl("/images/favicons/android-chrome-512x512.png")]: { width: 512, height: 512 },
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
      "https://github.com/WilliamAGH",
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
    width: OG_IMAGE_FALLBACK_DIMENSIONS[SEO_IMAGES.ogDefault]?.width,
    height: OG_IMAGE_FALLBACK_DIMENSIONS[SEO_IMAGES.ogDefault]?.height,
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
