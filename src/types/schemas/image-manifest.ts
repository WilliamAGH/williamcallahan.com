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

export type LogoManifestEntryFromSchema = z.infer<typeof logoManifestEntrySchema>;

export const logoManifestSchema = z.record(z.string(), logoManifestEntrySchema);

export type LogoManifestFromSchema = z.infer<typeof logoManifestSchema>;

export const imageManifestSchema = z.array(z.string().min(1));

export type ImageManifestFromSchema = z.infer<typeof imageManifestSchema>;
