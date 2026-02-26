/**
 * Image Manifest Mutations
 * @module lib/db/mutations/image-manifests
 * @description
 * Write operations for image manifests stored in PostgreSQL.
 * All mutations call assertDatabaseWriteAllowed() before writing.
 */

import { assertDatabaseWriteAllowed, db } from "@/lib/db/connection";
import { imageManifests } from "@/lib/db/schema/image-manifests";
import type { ImageManifestType } from "@/types/schemas/image-manifest";

/**
 * Upsert a single image manifest.
 * Inserts or updates the row for the given manifest type.
 */
export async function writeImageManifest(
  manifestType: ImageManifestType,
  payload: unknown,
): Promise<void> {
  assertDatabaseWriteAllowed("writeImageManifest");

  const updatedAt = Date.now();

  await db
    .insert(imageManifests)
    .values({
      manifestType,
      payload,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: imageManifests.manifestType,
      set: {
        payload,
        updatedAt,
      },
    });
}

/**
 * Upsert all three image manifests in parallel.
 * Used by the data fetch manager after building manifests from S3 listings.
 */
export async function writeAllImageManifests(manifests: {
  logos: unknown;
  opengraph: unknown;
  blog: unknown;
}): Promise<void> {
  assertDatabaseWriteAllowed("writeImageManifest");

  await Promise.all([
    writeImageManifest("logos", manifests.logos),
    writeImageManifest("opengraph", manifests.opengraph),
    writeImageManifest("blog", manifests.blog),
  ]);
}
