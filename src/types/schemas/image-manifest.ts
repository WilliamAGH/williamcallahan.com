/**
 * Image Manifest Schemas
 * @module types/schemas/image-manifest
 */

import { z } from "zod/v4";

export const logoManifestEntrySchema = z.object({
  cdnUrl: z.string().min(1),
  originalSource: z.string().min(1),
  invertedCdnUrl: z.string().min(1).optional(),
});

export type LogoManifestEntry = z.infer<typeof logoManifestEntrySchema>;

export const logoManifestSchema = z.record(z.string(), logoManifestEntrySchema);

export type LogoManifest = z.infer<typeof logoManifestSchema>;

export const imageManifestSchema = z.array(z.string().min(1));

export type ImageManifest = z.infer<typeof imageManifestSchema>;

/** Discriminated manifest type keys for the `image_manifests` DB table. */
export const IMAGE_MANIFEST_TYPES = ["logos", "opengraph", "blog"] as const;

export type ImageManifestType = (typeof IMAGE_MANIFEST_TYPES)[number];
