/**
 * OG Image Zod Schemas
 * @module types/schemas/og-image
 * @description
 * Validation schemas for OG image route parameters.
 * Types are derived via z.infer<> per [TS1e].
 */

import { z } from "zod/v4";

/** Supported OG image entity types */
export const ogEntitySchema = z.enum([
  "books",
  "bookmarks",
  "blog",
  "projects",
  "thoughts",
  "collection",
]);

export type OgEntity = z.infer<typeof ogEntitySchema>;

/** Query params for book OG images */
export const ogBookParamsSchema = z.object({
  title: z.string().default("Untitled Book"),
  author: z.string().optional(),
  coverUrl: z.string().optional(),
  formats: z.string().optional(),
});

export type OgBookParams = z.infer<typeof ogBookParamsSchema>;

/** Query params for bookmark OG images */
export const ogBookmarkParamsSchema = z.object({
  title: z.string().default("Bookmark"),
  domain: z.string().optional(),
  screenshotUrl: z.string().optional(),
});

export type OgBookmarkParams = z.infer<typeof ogBookmarkParamsSchema>;

/** Query params for blog OG images */
export const ogBlogParamsSchema = z.object({
  title: z.string().default("Blog Post"),
  author: z.string().optional(),
  coverUrl: z.string().optional(),
  tags: z.string().optional(),
});

export type OgBlogParams = z.infer<typeof ogBlogParamsSchema>;

/** Query params for project OG images */
export const ogProjectParamsSchema = z.object({
  title: z.string().default("Project"),
  screenshotUrl: z.string().optional(),
  tags: z.string().optional(),
});

export type OgProjectParams = z.infer<typeof ogProjectParamsSchema>;

/** Query params for text-based OG images (thoughts, collections, tag pages) */
export const ogTextParamsSchema = z.object({
  title: z.string().default(""),
  subtitle: z.string().optional(),
  section: z.string().optional(),
});

export type OgTextParams = z.infer<typeof ogTextParamsSchema>;

/** Props for layout renderers that receive a fetched cover image */
export interface OgBookLayoutProps extends OgBookParams {
  coverDataUrl: string | null;
}

/** Props for layout renderers that receive a fetched screenshot */
export interface OgBookmarkLayoutProps extends OgBookmarkParams {
  screenshotDataUrl: string | null;
}

/** Props for blog layout with fetched cover */
export interface OgBlogLayoutProps extends OgBlogParams {
  coverDataUrl: string | null;
}

/** Props for project layout with fetched screenshot */
export interface OgProjectLayoutProps extends OgProjectParams {
  screenshotDataUrl: string | null;
}
