/**
 * OpenGraph SEO Types
 * @module types/seo/opengraph
 * @description
 * Type definitions specific to OpenGraph metadata.
 */

import type { OpenGraph } from "next/dist/lib/metadata/types/opengraph-types";
import type { OpenGraphImage, PacificDateString } from "./shared";
import { openGraphUrlSchema } from "@/types/schemas/url";
import { z } from "zod/v4";

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
const nullableSafeOgUrlSchema = openGraphUrlSchema.nullable().optional().or(z.literal(""));
const stringOrNullSchema = z.string().nullable().optional();
const timestampSchema = z.number().int().positive();
const nonEmptyStringSchema = z.string().min(1);
const nullableUrlSchema = z.string().url().nullable().optional();
const ogMetadataRecordSchema = z.record(z.string(), stringOrNullSchema);
const socialProfilesSchema = z.record(z.string(), z.string());

/**
 * Schema for raw OpenGraph metadata from external APIs
 * Handles the uncertainty of external data with flexible validation
 */
export const ogMetadataSchema = z
  .object({
    title: stringOrNullSchema,
    description: stringOrNullSchema,
    image: nullableSafeOgUrlSchema,
    twitterImage: nullableSafeOgUrlSchema,
    site: stringOrNullSchema,
    type: stringOrNullSchema,
    profileImage: nullableSafeOgUrlSchema,
    bannerImage: nullableSafeOgUrlSchema,
    url: nullableSafeOgUrlSchema,
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
export const ogResultSchema = ogFetchResultSchema
  .extend({
    url: nonEmptyStringSchema,
    finalUrl: nullableUrlSchema,
    title: stringOrNullSchema,
    description: stringOrNullSchema,
    siteName: stringOrNullSchema,
    locale: stringOrNullSchema,
    timestamp: timestampSchema,
    source: z.enum(["cache", "s3", "external", "fallback"]),
    urlHash: z.string().optional(),
    errorDetails: z.unknown().optional(),
    imageAssetId: z.string().optional(),
    screenshotAssetId: z.string().optional(),
    socialProfiles: socialProfilesSchema.optional(),
    retryCount: z.number().int().min(0).optional(),
    actualUrl: nullableUrlSchema,
    profileImageUrl: z.string().nullable().optional(),
    ogMetadata: ogMetadataRecordSchema.optional(),
  })
  .passthrough();

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
  /** Unique key for idempotent storage (e.g., bookmark ID) */
  idempotencyKey: z.string().optional(),
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
