/**
 * Image Manifests Schema
 * @module lib/db/schema/image-manifests
 * @description
 * PostgreSQL table for storing image manifest data (logos, opengraph, blog).
 * Uses a keyed JSONB store pattern: each manifest type is a single row
 * with its full payload stored as JSONB.
 *
 * Manifest types:
 * - "logos": Record<string, { cdnUrl, originalSource, invertedCdnUrl? }>
 * - "opengraph": string[] of CDN URLs
 * - "blog": string[] of CDN URLs
 */

import { bigint, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import type { ImageManifestType } from "@/types/schemas/image-manifest";

export const imageManifests = pgTable("image_manifests", {
  manifestType: text("manifest_type").primaryKey().$type<ImageManifestType>(),
  payload: jsonb("payload").$type<unknown>().notNull(),
  checksum: text("checksum"),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
