/**
 * OpenGraph PostgreSQL read queries
 * @module db/queries/opengraph
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/connection";
import { opengraphMetadata, opengraphOverrides } from "@/lib/db/schema/opengraph";
import { ogResultSchema } from "@/types/seo/opengraph";
import type { OgResult } from "@/types";

/**
 * Parse and validate a JSONB payload as an OgResult.
 *
 * Returns null (with a console warning) when the payload does not satisfy the
 * schema rather than throwing, keeping the caller's fallback logic intact.
 */
function parseOgPayload(payload: unknown, context: string): OgResult | null {
  const parsed = ogResultSchema.safeParse(payload);
  if (!parsed.success) {
    console.warn(`[db/queries/opengraph] Invalid payload for ${context}:`, parsed.error);
    return null;
  }
  return parsed.data as OgResult;
}

/**
 * Read cached OpenGraph metadata for a URL hash.
 *
 * @param urlHash - SHA-256 hex digest of the normalized URL
 * @returns The stored OgResult or null when no row exists / payload invalid
 */
export async function readOgMetadata(urlHash: string): Promise<OgResult | null> {
  const rows = await db
    .select()
    .from(opengraphMetadata)
    .where(eq(opengraphMetadata.urlHash, urlHash))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }
  return parseOgPayload(row.payload, `metadata:${urlHash}`);
}

/**
 * Read a manual OpenGraph override for a URL hash.
 *
 * @param urlHash - SHA-256 hex digest of the normalized URL
 * @returns The stored OgResult or null when no override exists / payload invalid
 */
export async function readOgOverride(urlHash: string): Promise<OgResult | null> {
  const rows = await db
    .select()
    .from(opengraphOverrides)
    .where(eq(opengraphOverrides.urlHash, urlHash))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }
  return parseOgPayload(row.payload, `override:${urlHash}`);
}
