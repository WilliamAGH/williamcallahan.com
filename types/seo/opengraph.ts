/**
 * OpenGraph SEO Types
 * @module types/seo/opengraph
 * @description
 * Type definitions specific to OpenGraph metadata.
 */

import type { OpenGraph } from "next/dist/lib/metadata/types/opengraph-types";
import type { OpenGraphImage, PacificDateString } from "./shared";
import { z } from "zod";

/**
 * OpenGraph article metadata structure
 * @see {@link "https://ogp.me/#type_article"} - OpenGraph article specification
 */
export type ArticleOpenGraph = OpenGraph & {
  type: "article";
  article: {
    publishedTime: PacificDateString;
    modifiedTime: PacificDateString;
    section?: string;
    tags?: string[];
    authors?: string[];
  };
  images?: OpenGraphImage[];
};

/**
 * OpenGraph profile metadata structure
 * @see {@link "https://ogp.me/#type_profile"} - OpenGraph profile specification
 */
export type ProfileOpenGraph = OpenGraph & {
  type: "profile";
  firstName?: string;
  lastName?: string;
  username?: string;
  gender?: string;
  images?: OpenGraphImage[];
  profile?: {
    publishedTime?: PacificDateString;
    modifiedTime?: PacificDateString;
  };
};

/**
 * OpenGraph website metadata structure
 * @see {@link "https://ogp.me/#type_website"} - OpenGraph website specification
 */
export type WebsiteOpenGraph = OpenGraph & {
  type: "website";
  images?: OpenGraphImage[];
  website?: {
    publishedTime?: PacificDateString;
    modifiedTime?: PacificDateString;
  };
};

/**
 * Combined OpenGraph types
 */
export type ExtendedOpenGraph = ArticleOpenGraph | ProfileOpenGraph | WebsiteOpenGraph;

// Base schemas for common types
const urlSchema = z.string().url().optional().or(z.literal(""));
const stringOrNullSchema = z.string().nullable().optional();
const timestampSchema = z.number().int().positive();

/**
 * Schema for raw OpenGraph metadata from external APIs
 * Handles the uncertainty of external data with flexible validation
 */
export const ogMetadataSchema = z
  .object({
    title: stringOrNullSchema,
    description: stringOrNullSchema,
    image: urlSchema.or(stringOrNullSchema),
    twitterImage: urlSchema.or(stringOrNullSchema),
    site: stringOrNullSchema,
    type: stringOrNullSchema,
    profileImage: urlSchema.or(stringOrNullSchema),
    bannerImage: urlSchema.or(stringOrNullSchema),
    url: urlSchema.or(stringOrNullSchema),
    siteName: stringOrNullSchema,
  })
  .catchall(stringOrNullSchema); // Allow additional properties

/**
 * Schema for OpenGraph fetch results from external APIs
 */
export const ogFetchResultSchema = z.object({
  imageUrl: z.string().nullable(),
  bannerImageUrl: z.string().nullable().optional(),
  error: z.string().optional(),
});

/**
 * Schema for enhanced OpenGraph results with caching metadata
 */
export const ogResultSchema = ogFetchResultSchema.extend({
  timestamp: timestampSchema,
  source: z.enum(["cache", "external", "fallback"]),
  retryCount: z.number().int().min(0).optional(),
  actualUrl: urlSchema,
});

/**
 * Schema for Karakeep image fallback data
 */
export const karakeepImageFallbackSchema = z.object({
  /** Canonical URL of the image (preferred) */
  url: urlSchema.or(z.string().nullable().optional()),
  imageUrl: urlSchema.or(z.string().nullable().optional()),
  imageAssetId: z.string().nullable().optional(),
  screenshotAssetId: z.string().nullable().optional(),
  karakeepBaseUrl: urlSchema,
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  alt: z.string().nullable().optional(),
});

/**
 * Schema for OpenGraph cache entries
 */
export const ogCacheEntrySchema = ogResultSchema.extend({
  lastFetchedAt: timestampSchema,
  lastAttemptedAt: timestampSchema,
  isFailure: z.boolean().optional(),
});

// Type inference from schemas
export type ValidatedOgMetadata = z.infer<typeof ogMetadataSchema>;
export type ValidatedOgFetchResult = z.infer<typeof ogFetchResultSchema>;
export type ValidatedOgResult = z.infer<typeof ogResultSchema>;
export type ValidatedKarakeepImageFallback = z.infer<typeof karakeepImageFallbackSchema>;
export type ValidatedOgCacheEntry = z.infer<typeof ogCacheEntrySchema>;

// Alias for backward compatibility
export type KarakeepImageFallback = ValidatedKarakeepImageFallback;
