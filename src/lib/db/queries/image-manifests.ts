/**
 * Image Manifest Queries
 * @module lib/db/queries/image-manifests
 * @description
 * Read-only queries for image manifests stored in PostgreSQL.
 * Each manifest type ("logos", "opengraph", "blog") is a single row
 * with a JSONB payload.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/connection";
import { imageManifests } from "@/lib/db/schema/image-manifests";
import { IMAGE_MANIFEST_TYPES, type ImageManifestType } from "@/types/schemas/image-manifest";

/**
 * Read a single image manifest by type.
 * Returns the raw JSONB payload or null when not found.
 */
export async function readImageManifest(manifestType: ImageManifestType): Promise<unknown | null> {
  const rows = await db
    .select({ payload: imageManifests.payload })
    .from(imageManifests)
    .where(eq(imageManifests.manifestType, manifestType))
    .limit(1);

  const firstRow = rows[0];
  if (!firstRow) {
    return null;
  }

  return firstRow.payload;
}

/**
 * Read all three image manifests in a single query.
 * Returns a record keyed by manifest type with the raw JSONB payloads.
 * Missing manifests are omitted from the result.
 */
export async function readAllImageManifests(): Promise<
  Partial<Record<ImageManifestType, unknown>>
> {
  const rows = await db
    .select({
      manifestType: imageManifests.manifestType,
      payload: imageManifests.payload,
    })
    .from(imageManifests);

  const result: Partial<Record<ImageManifestType, unknown>> = {};
  for (const row of rows) {
    if (IMAGE_MANIFEST_TYPES.includes(row.manifestType)) {
      result[row.manifestType] = row.payload;
    }
  }

  return result;
}
