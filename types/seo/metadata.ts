/**
 * Core SEO Metadata Types and Validation
 * @module types/seo/metadata
 * @description
 * Type definitions and Zod validation schemas for core metadata functionality.
 * These types focus on standard meta tags, JSON-LD, Dublin Core, and ensure
 * SEO best practices through validation.
 */

import type { Metadata } from "next";
import type { OpenGraph } from "next/dist/lib/metadata/types/opengraph-types";
import { z } from "zod";

/**
 * Next.js metadata with script support
 * Extends the base Metadata type to include script field
 */
export interface ExtendedMetadata extends Metadata {
  script?: Array<{
    type: string;
    text: string;
  }>;
}

/**
 * Schema.org Article metadata
 * Used in JSON-LD structured data
 */
export interface ArticleSchema {
  "@context": "https://schema.org";
  "@type": "Article";
  headline: string;
  description: string;
  datePublished: string;
  dateModified: string;
  author: {
    "@type": "Person";
    name: string;
    url?: string;
  };
  publisher: {
    "@type": "Organization";
    name: string;
    logo?: {
      "@type": "ImageObject";
      url: string;
    };
  };
  image?: {
    "@type": "ImageObject";
    url: string;
    caption?: string;
  };
  mainEntityOfPage: {
    "@type": "WebPage";
    "@id": string;
  };
}

/**
 * Schema.org base metadata shared by all page types
 */
export interface BaseSchema {
  "@context": "https://schema.org";
  name: string;
  description: string;
  dateCreated: string;
  dateModified: string;
  datePublished: string;
}

/**
 * Schema.org ProfilePage metadata
 * Used for personal, professional, and academic profile pages
 */
export interface ProfileSchema extends BaseSchema {
  "@type": "ProfilePage";
  mainEntity: {
    "@type": "Person";
    name: string;
    description: string;
    sameAs?: string[];
    image?: string;
  };
}

/**
 * Schema.org CollectionPage metadata
 * Used for pages that list multiple items (blog posts, investments, bookmarks)
 */
export interface CollectionSchema extends BaseSchema {
  "@type": "CollectionPage";
  mainEntity: {
    "@type": "ItemList";
    itemListElement: Array<{
      "@type": "ListItem";
      position: number;
      url: string;
      name: string;
    }>;
  };
}

/**
 * Complete article metadata structure
 * Combines all metadata types into a single interface
 */
export interface ArticleMetadata extends Omit<ExtendedMetadata, "openGraph"> {
  openGraph?: OpenGraph;
  other: {
    [key: string]: string | number | (string | number)[];
  };
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * SEO-optimized string lengths based on best practices
 */
export const SEO_LIMITS = {
  /** Title tag: 50-60 chars optimal for search results */
  TITLE_MAX: 60,
  /** Meta description: 150-160 chars optimal for search results */
  DESCRIPTION_MAX: 160,
  /** OpenGraph title: 55-65 chars optimal */
  OG_TITLE_MAX: 65,
  /** OpenGraph description: 150-200 chars optimal */
  OG_DESCRIPTION_MAX: 200,
  /** Twitter description: 125-200 chars optimal */
  TWITTER_DESCRIPTION_MAX: 200,
  /** Minimum meaningful content length */
  MIN_LENGTH: 10,
} as const;

/**
 * ISO 8601 date string validator
 * Ensures dates are properly formatted for SEO
 */
const isoDateString = z.string().refine((val) => !Number.isNaN(Date.parse(val)), {
  message: "Must be a valid ISO 8601 date string",
});

/**
 * URL validator with HTTPS enforcement
 * All production URLs should use HTTPS for SEO
 */
const httpsUrl = z
  .string()
  .url()
  .refine((url) => url.startsWith("https://"), { message: "URLs must use HTTPS protocol" });

/**
 * Social media handle validator
 * Ensures handles follow platform conventions
 */
const socialHandle = z.string().regex(/^@?[\w\d_]+$/, "Invalid social media handle format");

/**
 * Base page metadata schema
 * Common fields for all page types
 */
export const basePageMetadataSchema = z.object({
  title: z
    .string()
    .min(SEO_LIMITS.MIN_LENGTH, `Title must be at least ${SEO_LIMITS.MIN_LENGTH} characters`)
    .max(
      SEO_LIMITS.TITLE_MAX,
      `Title should be under ${SEO_LIMITS.TITLE_MAX} characters for optimal SEO`,
    ),

  description: z
    .string()
    .min(SEO_LIMITS.MIN_LENGTH, `Description must be at least ${SEO_LIMITS.MIN_LENGTH} characters`)
    .max(
      SEO_LIMITS.DESCRIPTION_MAX,
      `Description should be under ${SEO_LIMITS.DESCRIPTION_MAX} characters for optimal SEO`,
    ),

  dateCreated: isoDateString,
  dateModified: isoDateString,
});

/**
 * Profile page metadata schema
 * For pages representing a person or entity
 */
export const profilePageMetadataSchema = basePageMetadataSchema.extend({
  bio: z
    .string()
    .min(SEO_LIMITS.MIN_LENGTH)
    .max(
      SEO_LIMITS.OG_DESCRIPTION_MAX,
      `Bio should be under ${SEO_LIMITS.OG_DESCRIPTION_MAX} characters`,
    ),

  interactionStats: z
    .object({
      follows: z.number().int().nonnegative().optional(),
      likes: z.number().int().nonnegative().optional(),
      posts: z.number().int().nonnegative().optional(),
    })
    .optional(),

  profileImage: z.string().url().optional(),
  alternateName: z.string().optional(),
  identifier: z.string().optional(),
});

/**
 * Collection page metadata schema
 * For pages that list multiple items
 */
export const collectionPageMetadataSchema = basePageMetadataSchema.extend({
  bio: z.never().optional(), // Explicitly no bio for collection pages
});

/**
 * Image metadata schema
 * For validating image objects in metadata
 */
export const imageMetadataSchema = z.object({
  url: z.string().url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: z.string().min(1, "Alt text is required for accessibility"),
  type: z.string().optional(),
});

/**
 * OpenGraph metadata schema
 * Validates OpenGraph-specific fields
 */
export const openGraphSchema = z.object({
  type: z.enum(["website", "article", "profile", "book", "music", "video"]),
  locale: z.string().regex(/^[a-z]{2}_[A-Z]{2}$/, "Locale must be in format: en_US"),
  url: httpsUrl,
  siteName: z.string().min(1),
  images: z.array(imageMetadataSchema).min(1, "At least one OpenGraph image is required"),
});

/**
 * Main site metadata schema
 * Validates the entire metadata configuration object
 */
export const metadataSchema = z.object({
  title: z.string().min(SEO_LIMITS.MIN_LENGTH).max(SEO_LIMITS.TITLE_MAX),

  description: z.string().min(SEO_LIMITS.MIN_LENGTH).max(SEO_LIMITS.DESCRIPTION_MAX),

  shortDescription: z.string().min(SEO_LIMITS.MIN_LENGTH).max(SEO_LIMITS.OG_DESCRIPTION_MAX),

  author: z.string().min(1),
  url: httpsUrl,

  keywords: z
    .array(z.string().min(1))
    .min(5, "At least 5 keywords recommended for SEO")
    .max(10, "Too many keywords can hurt SEO"),

  site: z.object({
    name: z.string().min(1),
    url: httpsUrl,
    locale: z.string().regex(/^[a-z]{2}_[A-Z]{2}$/),
  }),

  social: z.object({
    twitter: socialHandle,
    linkedin: z.string().min(1),
    github: z.string().min(1),
    profiles: z.array(httpsUrl).min(1),
  }),

  article: z.object({
    section: z.string().min(1),
    author: z.string().min(1),
    publisher: z.string().min(1),
  }),

  defaultImage: imageMetadataSchema,
  openGraph: openGraphSchema,
});

/**
 * Page metadata schemas map
 * Maps page keys to their appropriate schema
 */
export const pageMetadataSchemas = {
  home: profilePageMetadataSchema,
  experience: profilePageMetadataSchema,
  education: profilePageMetadataSchema,
  investments: collectionPageMetadataSchema,
  bookmarks: collectionPageMetadataSchema,
  blog: collectionPageMetadataSchema,
  projects: collectionPageMetadataSchema,
  contact: collectionPageMetadataSchema,
} as const;

/**
 * Validate page metadata configuration
 * @param pageKey - The page key to validate
 * @param metadata - The metadata to validate
 * @returns Validated metadata or throws ZodError
 */
export function validatePageMetadata<K extends keyof typeof pageMetadataSchemas>(
  pageKey: K,
  metadata: unknown,
): z.infer<(typeof pageMetadataSchemas)[K]> {
  const schema = pageMetadataSchemas[pageKey];
  return schema.parse(metadata);
}

/**
 * Validate the entire metadata configuration
 * @param metadata - The metadata object to validate
 * @returns Validated metadata or throws ZodError
 */
export function validateMetadata(metadata: unknown) {
  return metadataSchema.parse(metadata);
}

/**
 * Safe metadata validation with error details
 * @param metadata - The metadata to validate
 * @returns Success with data or error with details
 */
export function safeValidateMetadata(metadata: unknown) {
  const result = metadataSchema.safeParse(metadata);

  if (!result.success) {
    // Format errors for better readability
    const errors = result.error.errors.map((err) => ({
      path: err.path.join("."),
      message: err.message,
      code: err.code,
    }));

    return {
      success: false as const,
      errors,
      summary: `Metadata validation failed with ${errors.length} error(s)`,
    };
  }

  return {
    success: true as const,
    data: result.data,
  };
}

/**
 * Type exports for use in other modules
 */
export type MetadataConfig = z.infer<typeof metadataSchema>;
export type ProfilePageMetadata = z.infer<typeof profilePageMetadataSchema>;
export type CollectionPageMetadata = z.infer<typeof collectionPageMetadataSchema>;
export type ValidatedMetadata<K extends keyof typeof pageMetadataSchemas> = z.infer<
  (typeof pageMetadataSchemas)[K]
>;
