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
  LOCAL_OG_ASSETS,
  SITE_DESCRIPTION_SHORT,
  SITE_NAME,
  SITE_TITLE,
  SEO_IMAGES,
  OG_IMAGE_FALLBACK_DIMENSIONS,
  metadata as siteMetadata,
} from "../../data/metadata";
import type { ArticleMetadata, ExtendedMetadata, ArticleParams, SoftwareAppParams } from "../../types/seo";
import { SEO_DATE_FIELDS } from "@/lib/constants";
import type { ExtendedOpenGraph } from "../../types/seo/opengraph";
import type { SchemaParams } from "../../types/seo/schema";
import { createArticleOgMetadata } from "./opengraph";
import { generateSchemaGraph } from "./schema";
import { ensureAbsoluteUrl, formatSeoDate } from "./utils";
import { generateDynamicTitle } from "./dynamic-metadata";
import { prepareOGImageUrl, validateOpenGraphMetadata } from "./og-validation";
import { adaptNextOpenGraphToOGMetadata } from "../../types/seo/validation";

/**
 * Base metadata configuration for all pages
 * Includes common metadata fields that are shared across the site
 *
 * @see {@link "../../data/metadata.ts"} - Source of these values
 */
export const BASE_METADATA: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION_SHORT,
  metadataBase: new URL(siteMetadata.site.url),
  twitter: {
    card: "summary_large_image",
    site: siteMetadata.social.twitter,
    creator: siteMetadata.social.twitter,
  },
  alternates: {
    canonical: "https://williamcallahan.com",
  },
  authors: [
    {
      name: siteMetadata.author,
      url: siteMetadata.site.url,
    },
  ],
  creator: siteMetadata.author,
  publisher: siteMetadata.article.publisher,
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
  education: "ogEducation",
  investments: "ogInvestments",
  contact: "ogContact",
};

/**
 * Creates metadata for article pages
 * Handles browser tab title and delegates OpenGraph metadata to opengraph.ts
 *
 * @param {ArticleParams} params - Article metadata parameters
 * @returns {ArticleMetadata} Next.js metadata object for the article page
 * @see {@link "./opengraph.ts"} - For OpenGraph metadata generation
 * @see {@link "https://ogp.me/#type_article"} - OpenGraph article specification
 * @see {@link "https://schema.org/NewsArticle"} - Schema.org NewsArticle specification
 */
export function createArticleMetadata({
  title,
  description,
  url,
  image,
  datePublished,
  dateModified,
  tags,
  articleBody = "Article content not available",
  useNewsArticle = true, // Default to NewsArticle schema for better SEO
  authors,
}: ArticleParams): ArticleMetadata {
  // Format dates in Pacific Time with proper offset
  const formattedPublished = formatSeoDate(datePublished);
  const formattedModified = formatSeoDate(dateModified);

  const browserTitle = generateDynamicTitle(title, "blog");

  // Create image variations for NewsArticle schema
  let imageVariations: string[] | undefined;

  if (image) {
    const baseImageUrl = ensureAbsoluteUrl(image);
    // Create different image aspect ratios (1:1, 4:3, 16:9) for Google's rich results
    imageVariations = [
      image.endsWith(".jpg") ? baseImageUrl.replace(".jpg", "-1x1.jpg") : `${baseImageUrl}?format=1x1`,
      image.endsWith(".jpg") ? baseImageUrl.replace(".jpg", "-4x3.jpg") : `${baseImageUrl}?format=4x3`,
      image.endsWith(".jpg") ? baseImageUrl.replace(".jpg", "-16x9.jpg") : `${baseImageUrl}?format=16x9`,
    ];
  }

  // Generate schema graph
  const schemaParams: SchemaParams = {
    path: new URL(url).pathname,
    title: browserTitle, // Use truncated title for schema
    description,
    datePublished: formattedPublished,
    dateModified: formattedModified,
    type: useNewsArticle ? "newsarticle" : "article",
    articleBody,
    keywords: tags,
    image: image
      ? {
          url: image,
          width: siteMetadata.defaultImage.width,
          height: siteMetadata.defaultImage.height,
        }
      : undefined,
    images: imageVariations,
    authors: authors || [{ name: SITE_NAME, url: ensureAbsoluteUrl("/") }],
    breadcrumbs: [
      { path: "/", name: "Home" },
      { path: "/blog", name: "Blog" },
      { path: new URL(url).pathname, name: browserTitle }, // Use truncated title for breadcrumb
    ],
  };

  const schema = generateSchemaGraph(schemaParams);

  return {
    title: browserTitle,
    description,
    alternates: {
      canonical: url,
    },
    script: [
      {
        type: "application/ld+json",
        text: JSON.stringify(schema, null, process.env.NODE_ENV === "development" ? 2 : 0),
      },
    ],
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

      // OpenGraph article dates (as meta properties)
      [`property=${SEO_DATE_FIELDS.openGraph.published}`]: formattedPublished,
      [`property=${SEO_DATE_FIELDS.openGraph.modified}`]: formattedModified,
      [`name=${SEO_DATE_FIELDS.openGraph.published}`]: formattedPublished,
      [`name=${SEO_DATE_FIELDS.openGraph.modified}`]: formattedModified,
    },
  };
}

/**
 * Get metadata for a static page
 * Includes published and modified dates for SEO
 *
 * @param {string} path - The path of the page (e.g., "/", "/blog")
 * @param {keyof typeof PAGE_METADATA} pageKey - The key for the page's metadata in PAGE_METADATA
 * @returns {ExtendedMetadata} Next.js metadata object for the page
 */
export function getStaticPageMetadata(path: string, pageKey: keyof typeof PAGE_METADATA): ExtendedMetadata {
  const pageMetadata = PAGE_METADATA[pageKey];
  const formattedCreated = formatSeoDate(pageMetadata.dateCreated);
  const formattedModified = formatSeoDate(pageMetadata.dateModified);

  // Determine page type and breadcrumbs
  const isProfilePage = ["home", "experience", "education"].includes(pageKey);
  const isCollectionPage = ["blog", "investments", "bookmarks", "projects", "contact"].includes(pageKey);
  const isDatasetPage = pageKey === "investments";

  const breadcrumbs =
    path === "/"
      ? undefined
      : [
          { path: "/", name: "Home" },
          { path, name: pageMetadata.title },
        ];

  // Look up the OG image key and path from our map. Fallback to default if not found.
  const ogImageKey = PAGE_OG_IMAGE_MAP[pageKey] || "ogDefault";
  const ogImagePath = SEO_IMAGES[ogImageKey] || SEO_IMAGES.ogDefault;

  // Track image dimensions separately so we can override per-page when needed
  let ogWidth: number = siteMetadata.defaultImage.width;
  let ogHeight: number = siteMetadata.defaultImage.height;

  // Type assertion is safe here because LOCAL_OG_ASSETS keys are the compile-time
  // image paths defined in data/metadata.ts. If the path exists, we can rely on
  // Next.js-provided width/height for perfect accuracy.
  const maybeLocal = (LOCAL_OG_ASSETS as Record<string, { width: number; height: number }>)[ogImagePath];
  if (maybeLocal?.width && maybeLocal.height) {
    ogWidth = maybeLocal.width;
    ogHeight = maybeLocal.height;
  } else {
    // Fallback to predefined dimensions if Next.js import doesn't provide them
    const fallbackDimensions = OG_IMAGE_FALLBACK_DIMENSIONS[ogImagePath as keyof typeof OG_IMAGE_FALLBACK_DIMENSIONS];
    if (fallbackDimensions) {
      ogWidth = fallbackDimensions.width;
      ogHeight = fallbackDimensions.height;
    }
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

  // Generate schema graph
  const schemaParams: SchemaParams = {
    path,
    title: pageMetadata.title,
    description: pageMetadata.description,
    datePublished: formattedCreated,
    dateModified: formattedModified,
    type: isProfilePage ? "profile" : isDatasetPage ? "dataset" : isCollectionPage ? "collection" : undefined,
    breadcrumbs,
    image: {
      url: siteMetadata.defaultImage.url,
      width: siteMetadata.defaultImage.width,
      height: siteMetadata.defaultImage.height,
    },
    // Add profile metadata if this is a profile page
    ...(isProfilePage &&
      "bio" in pageMetadata && {
        profileMetadata: {
          bio: (pageMetadata as { bio: string }).bio,
          ...("alternateName" in pageMetadata && {
            alternateName: (pageMetadata as { alternateName: string }).alternateName,
          }),
          ...("identifier" in pageMetadata && {
            identifier: (pageMetadata as { identifier: string }).identifier,
          }),
          ...("profileImage" in pageMetadata && {
            profileImage: (pageMetadata as { profileImage: string }).profileImage,
          }),
          ...("interactionStats" in pageMetadata && {
            interactionStats: (pageMetadata as { interactionStats: { follows: number; posts: number } })
              .interactionStats,
          }),
        },
      }),
  };

  const schema = generateSchemaGraph(schemaParams);

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
  } else if (isCollectionPage) {
    openGraph = {
      title: pageMetadata.title,
      description: pageMetadata.description,
      url: ensureAbsoluteUrl(path),
      images: [socialImage],
      siteName: SITE_NAME,
      locale: "en_US",
      type: "article",
      article: {
        publishedTime: formattedCreated,
        modifiedTime: formattedModified,
        section: pageMetadata.title,
        tags: [],
        authors: [siteMetadata.author],
      },
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
    script: [
      {
        type: "application/ld+json",
        text: JSON.stringify(schema, null, process.env.NODE_ENV === "development" ? 2 : 0),
      },
    ],
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

      // OpenGraph article dates (as meta properties)
      [`property=${SEO_DATE_FIELDS.openGraph.published}`]: formattedCreated,
      [`property=${SEO_DATE_FIELDS.openGraph.modified}`]: formattedModified,
      [`name=${SEO_DATE_FIELDS.openGraph.published}`]: formattedCreated,
      [`name=${SEO_DATE_FIELDS.openGraph.modified}`]: formattedModified,
    },
    // Add bookmarks metadata for relevant pages
    ...(pageKey === "bookmarks" && {
      bookmarks: [], // Will be populated with actual bookmarks
      category: "Resources",
    }),
  };
}

/**
 * Creates metadata for software application pages
 * This can be used with blog posts about software or dedicated software pages
 *
 * @param {SoftwareAppParams} params - Software application parameters
 * @returns {ArticleMetadata} Next.js metadata object for the page
 * @see {@link "https://schema.org/SoftwareApplication"} - Schema.org SoftwareApplication specification
 */
export function createSoftwareApplicationMetadata({
  title,
  description,
  url,
  image,
  datePublished,
  dateModified,
  tags,
  articleBody = "",
  softwareName,
  operatingSystem,
  applicationCategory = "DeveloperApplication",
  isFree = true,
  price,
  priceCurrency = "USD",
  ratingValue,
  ratingCount,
  downloadUrl,
  softwareVersion,
  screenshot,
  authors,
}: SoftwareAppParams): ArticleMetadata {
  // Format dates in Pacific Time with proper offset
  const formattedPublished = formatSeoDate(datePublished);
  const formattedModified = formatSeoDate(dateModified);

  const browserTitle = generateDynamicTitle(title, "blog");

  // Generate schema graph
  const schemaParams: SchemaParams = {
    path: new URL(url).pathname,
    title: browserTitle, // Use truncated title for schema
    description,
    datePublished: formattedPublished,
    dateModified: formattedModified,
    type: "software",
    articleBody,
    keywords: tags,
    image: image
      ? {
          url: image,
          width: siteMetadata.defaultImage.width,
          height: siteMetadata.defaultImage.height,
        }
      : undefined,
    authors,
    breadcrumbs: [
      { path: "/", name: "Home" },
      { path: "/blog", name: "Blog" },
      { path: new URL(url).pathname, name: browserTitle }, // Use truncated title for breadcrumb
    ],
    // Add software-specific metadata
    softwareMetadata: {
      name: softwareName,
      operatingSystem,
      applicationCategory,
      isFree,
      price,
      priceCurrency,
      ratingValue,
      ratingCount,
      downloadUrl,
      softwareVersion,
      screenshot,
    },
  };

  const schema = generateSchemaGraph(schemaParams);

  return {
    title: browserTitle,
    description,
    alternates: {
      canonical: url,
    },
    script: [
      {
        type: "application/ld+json",
        text: JSON.stringify(schema, null, process.env.NODE_ENV === "development" ? 2 : 0),
      },
    ],
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

      // OpenGraph article dates (as meta properties)
      [`property=${SEO_DATE_FIELDS.openGraph.published}`]: formattedPublished,
      [`property=${SEO_DATE_FIELDS.openGraph.modified}`]: formattedModified,
      [`name=${SEO_DATE_FIELDS.openGraph.published}`]: formattedPublished,
      [`name=${SEO_DATE_FIELDS.openGraph.modified}`]: formattedModified,
    },
  };
}
