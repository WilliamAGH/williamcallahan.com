/**
 * OpenGraph PostgreSQL write mutations
 * @module db/mutations/opengraph
 */

import { assertDatabaseWriteAllowed, db } from "@/lib/db/connection";
import { opengraphMetadata, opengraphOverrides } from "@/lib/db/schema/opengraph";
import type { OgResult } from "@/types";

/**
 * Upsert cached OpenGraph metadata for a URL.
 *
 * @param urlHash - SHA-256 hex digest of the normalized URL
 * @param url - Original URL (stored for debugging / human inspection)
 * @param data - The OgResult payload to persist
 */
export async function writeOgMetadata(urlHash: string, url: string, data: OgResult): Promise<void> {
  assertDatabaseWriteAllowed("writeOgMetadata");

  const now = Date.now();
  await db
    .insert(opengraphMetadata)
    .values({
      urlHash,
      url,
      payload: data,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: opengraphMetadata.urlHash,
      set: {
        url,
        payload: data,
        updatedAt: now,
      },
    });
}

/**
 * Upsert a manual OpenGraph override for a URL.
 *
 * @param urlHash - SHA-256 hex digest of the normalized URL
 * @param url - Original URL (stored for debugging / human inspection)
 * @param data - The OgResult payload to persist as an override
 */
export async function writeOgOverride(urlHash: string, url: string, data: OgResult): Promise<void> {
  assertDatabaseWriteAllowed("writeOgOverride");

  const now = Date.now();
  await db
    .insert(opengraphOverrides)
    .values({
      urlHash,
      url,
      payload: data,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: opengraphOverrides.urlHash,
      set: {
        url,
        payload: data,
        updatedAt: now,
      },
    });
}
