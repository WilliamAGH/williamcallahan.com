import { eq, like } from "drizzle-orm";
import { db } from "@/lib/db/connection";
import { jsonDocuments } from "@/lib/db/schema/json-documents";
import type { S3ObjectMetadata } from "@/types/s3-cdn";

export async function getJsonDocumentPayloadByKey(key: string): Promise<unknown | null> {
  const rows = await db
    .select({ payload: jsonDocuments.payload })
    .from(jsonDocuments)
    .where(eq(jsonDocuments.key, key))
    .limit(1);

  return rows[0]?.payload ?? null;
}

export async function listJsonDocumentKeysByPrefix(prefix: string): Promise<string[]> {
  const rows = await db
    .select({ key: jsonDocuments.key })
    .from(jsonDocuments)
    .where(like(jsonDocuments.key, `${prefix}%`))
    .orderBy(jsonDocuments.key);

  return rows.map((row) => row.key);
}

export async function getJsonDocumentMetadataByKey(key: string): Promise<S3ObjectMetadata | null> {
  const rows = await db
    .select({
      eTag: jsonDocuments.eTag,
      updatedAt: jsonDocuments.updatedAt,
      contentLength: jsonDocuments.contentLength,
      contentType: jsonDocuments.contentType,
    })
    .from(jsonDocuments)
    .where(eq(jsonDocuments.key, key))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    eTag: row.eTag ?? undefined,
    lastModified: new Date(row.updatedAt),
    contentLength: row.contentLength,
    contentType: row.contentType,
  };
}
