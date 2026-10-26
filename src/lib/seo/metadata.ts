/**
 * Core SEO Metadata Implementation
 * @module lib/seo/metadata
 * @description
 * Handles the generation of all non-OpenGraph metadata for the site, including:
 * - Browser tab title and description
 * - Canonical URLs
 * - Twitter card metadata
 * - Author and publisher information
 * - Format detection settings
 *
 * This module focuses on Next.js's Metadata API structure. It delegates OpenGraph
 * metadata generation to the opengraph.ts module.
 *
 * @see {@link "./opengraph.ts"} - For OpenGraph metadata generation
 * @see {@link "../../data/metadata.ts"} - For base metadata values
 * @see {@link "https://nextjs.org/docs/app/api-reference/functions/generate-metadata"} - Next.js Metadata API
 */

import type { Metadata } from "next";
import {
  PAGE_METADATA,
  SITE_DESCRIPTION_SHORT,
  SITE_NAME,
  SITE_TITLE,
  SEO_IMAGES,
  OG_IMAGE_DIMENSIONS,
  metadata as siteMetadata,
} from "@/data/metadata";
import type { ArticleMetadata, ArticleParams } from "../../types/seo";
import { SEO_DATE_FIELDS } from "@/lib/constants";
import type { ExtendedOpenGraph } from "../../types/seo/opengraph";
import { createArticleOgMetadata } from "./opengraph";
import { ensureAbsoluteUrl } from "./url-utils";
import { formatSeoDate } from "./utils";
import { generateDynamicTitle } from "./dynamic-metadata";
import { prepareOGImageUrl, validateOpenGraphMetadata } from "./og-validation";
import { adaptNextOpenGraphToOGMetadata } from "../../types/seo/validation";

/**
 * Base metadata configuration for all pages
 * Includes common metadata fields that are shared across the site. It carries no canonical:
 * each indexable route sets its own, so no utility route inherits the homepage URL.
 *
 * @see {@link "../../data/metadata.ts"} - Source of these values
 */
export const BASE_METADATA: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION_SHORT,
  twitter: {
    card: "summary_large_image",
    site: siteMetadata.social.twitter,
    creator: siteMetadata.social.twitter,
  },
  authors: [
    {
      name: siteMetadata.author,
      url: siteMetadata.site.url,
    },
  ],
  creator: siteMetadata.author,
  publisher: siteMetadata.article.publisher,
  metadataBase: siteMetadata.site.url,
  formatDetection: {
    telephone: false,
    address: false,
    email: true,
  },
};

/**
 * A map connecting page keys to their specific OpenGraph image assets.
 * This provides a single, clear source of truth for social sharing images
 * and avoids brittle if/else chains in metadata generation logic.
 */
const PAGE_OG_IMAGE_MAP: Record<keyof typeof PAGE_METADATA, keyof typeof SEO_IMAGES> = {
  home: "ogDefault",
  blog: "ogBlogIndex",
  bookmarks: "ogBookmarks",
  projects: "ogProjects",
  experience: "ogExperience",
  cv: "ogCv",
  education: "ogEducation",
  investments: "ogInvestments",
  contact: "ogContact",
  books: "ogDefault",
  thoughts: "ogDefault",
};

/**
 * Creates metadata for article pages
 * Handles browser tab title and delegates OpenGraph metadata to opengraph.ts
 *
 * @param {ArticleParams} params - Article metadata parameters
 * @returns {ArticleMetadata} Next.js metadata object for the article page
 * @see {@link "./opengraph.ts"} - For OpenGraph metadata generation
 * @see {@link "https://ogp.me/#type_article"} - OpenGraph article specification
 * @see {@link "https://schema.org/Article"} - Schema.org Article specification
 */
export function createArticleMetadata({
  title,
  description,
  url,
  image,
  datePublished,
  dateModified,
  tags,
}: ArticleParams): ArticleMetadata {
  // Format dates in Pacific Time with proper offset
  const formattedPublished = formatSeoDate(datePublished);
  const formattedModified = formatSeoDate(dateModified);

  const browserTitle = generateDynamicTitle(title, "blog");

  return {
    title: browserTitle,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: createArticleOgMetadata({
      title: browserTitle, // Use truncated title for OpenGraph
      description,
      url,
      image,
      datePublished,
      dateModified,
      tags,
    }),
    twitter: {
      card: "summary_large_image",
      site: siteMetadata.social.twitter,
      creator: siteMetadata.social.twitter,
      title: browserTitle, // Use truncated title for Twitter
      description,
      images: image
        ? [{ url: ensureAbsoluteUrl(image) }]
        : [
            {
              url: ensureAbsoluteUrl(siteMetadata.defaultImage.url),
              width: siteMetadata.defaultImage.width,
              height: siteMetadata.defaultImage.height,
              alt: siteMetadata.defaultImage.alt,
            },
          ],
    },
    other: {
      // Standard HTML meta dates
      [SEO_DATE_FIELDS.meta.published]: formattedPublished,
      [SEO_DATE_FIELDS.meta.modified]: formattedModified,

      // Optional Dublin Core dates
      [SEO_DATE_FIELDS.dublinCore.created]: formattedPublished,
      [SEO_DATE_FIELDS.dublinCore.modified]: formattedModified,
      [SEO_DATE_FIELDS.dublinCore.issued]: formattedPublished,
    },
  };
}

/**
 * Get metadata for a static page
 * Includes published and modified dates for SEO
 *
 * @param {string} path - The path of the page (e.g., "/", "/blog")
 * @param {keyof typeof PAGE_METADATA} pageKey - The key for the page's metadata in PAGE_METADATA
 * @returns {Metadata} Next.js metadata object for the page
 */
export function getStaticPageMetadata(path: string, pageKey: keyof typeof PAGE_METADATA): Metadata {
  const pageMetadata = PAGE_METADATA[pageKey];
  const formattedCreated = formatSeoDate(pageMetadata.dateCreated);
  const formattedModified = formatSeoDate(pageMetadata.dateModified);

  // Page components own their rendered JSON-LD; metadata only selects the OG type.
  const isProfilePage = ["home", "experience", "education"].includes(pageKey);

  // Look up the OG image key and path from our map. Fallback to default if not found.
  const ogImageKey = PAGE_OG_IMAGE_MAP[pageKey] || "ogDefault";
  const ogImagePath = SEO_IMAGES[ogImageKey] || SEO_IMAGES.ogDefault;

  // Track image dimensions separately so we can override per-page when needed
  let ogWidth: number = siteMetadata.defaultImage.width ?? 1200;
  let ogHeight: number = siteMetadata.defaultImage.height ?? 630;

  const staticDimensions = OG_IMAGE_DIMENSIONS[ogImagePath as keyof typeof OG_IMAGE_DIMENSIONS];
  if (staticDimensions) {
    ogWidth = staticDimensions.width;
    ogHeight = staticDimensions.height;
  }

  // Use validation and preparation function for OG image URL
  const processedImageUrl = prepareOGImageUrl(ogImagePath, ogWidth, ogHeight);

  const socialImage = {
    url: processedImageUrl,
    width: ogWidth,
    height: ogHeight,
    alt: pageMetadata.description, // Use page description for alt text
    type: "image/png", // Assuming all OG images are PNGs
  };

  // Create type-safe OpenGraph object based on page type
  let openGraph: ExtendedOpenGraph;

  if (isProfilePage) {
    openGraph = {
      title: pageMetadata.title,
      description: pageMetadata.description,
      url: ensureAbsoluteUrl(path),
      images: [socialImage],
      siteName: SITE_NAME,
      locale: "en_US",
      type: "profile",
      firstName: SITE_NAME.split(" ")[0],
      lastName: SITE_NAME.split(" ")[1],
      username: siteMetadata.social.twitter.replace("@", ""),
    };
  } else {
    openGraph = {
      title: pageMetadata.title,
      description: pageMetadata.description,
      url: ensureAbsoluteUrl(path),
      images: [socialImage],
      siteName: SITE_NAME,
      locale: "en_US",
      type: "website",
    };
  }

  // Validate OpenGraph metadata in development
  if (process.env.NODE_ENV === "development") {
    const ogMetadata = adaptNextOpenGraphToOGMetadata(openGraph);
    if (ogMetadata) {
      const validation = validateOpenGraphMetadata(ogMetadata);
      if (!validation.isValid) {
        console.error(`[OG Validation] Errors for ${path}:`, validation.errors);
      }
      if (validation.warnings.length > 0) {
        console.warn(`[OG Validation] Warnings for ${path}:`, validation.warnings);
      }
    }
  }

  return {
    ...BASE_METADATA,
    title: pageMetadata.title,
    description: pageMetadata.description,
    alternates: {
      canonical: ensureAbsoluteUrl(path),
    },
    openGraph,
    twitter: {
      card: "summary_large_image",
      site: siteMetadata.social.twitter,
      creator: siteMetadata.social.twitter,
      title: pageMetadata.title,
      description: pageMetadata.description,
      images: [socialImage], // Use the same consistent image object
    },
    other: {
      // Standard HTML meta dates
      [SEO_DATE_FIELDS.meta.published]: formattedCreated,
      [SEO_DATE_FIELDS.meta.modified]: formattedModified,

      // Optional Dublin Core dates
      [SEO_DATE_FIELDS.dublinCore.created]: formattedCreated,
      [SEO_DATE_FIELDS.dublinCore.modified]: formattedModified,
      [SEO_DATE_FIELDS.dublinCore.issued]: formattedCreated,
    },
    // Add bookmarks metadata for relevant pages
    ...(pageKey === "bookmarks" && {
      bookmarks: [], // Will be populated with actual bookmarks
      category: "Resources",
    }),
  };
}
