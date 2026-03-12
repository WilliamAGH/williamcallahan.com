import { eq } from "drizzle-orm";
import { db } from "@/lib/db/connection";
import { searchIndexArtifacts } from "@/lib/db/schema/bookmark-taxonomy";
import {
  searchIndexBuildMetadataSchema,
  serializedIndexSchema,
  type SearchIndexArtifact,
  type SearchIndexArtifactDomain,
  type SearchIndexBuildMetadata,
  type SerializedSearchIndexArtifactDomain,
  type SerializedIndex,
} from "@/types/schemas/search";

const parseSearchIndexArtifactPayload = (
  domain: SearchIndexArtifactDomain,
  payload: unknown,
): SearchIndexArtifact => {
  if (domain === "build-metadata") {
    return searchIndexBuildMetadataSchema.parse(payload);
  }

  return serializedIndexSchema.parse(payload);
};

export async function getSearchIndexArtifact(
  domain: SearchIndexArtifactDomain,
): Promise<SearchIndexArtifact | null> {
  const rows = await db
    .select({ payload: searchIndexArtifacts.payload })
    .from(searchIndexArtifacts)
    .where(eq(searchIndexArtifacts.domain, domain))
    .limit(1);

  const firstRow = rows[0];
  if (!firstRow) {
    return null;
  }

  return parseSearchIndexArtifactPayload(domain, firstRow.payload);
}

export async function getSerializedSearchIndexArtifact(
  domain: SerializedSearchIndexArtifactDomain,
): Promise<SerializedIndex | null> {
  const payload = await getSearchIndexArtifact(domain);
  if (!payload) {
    return null;
  }

  return serializedIndexSchema.parse(payload);
}

export async function getSearchIndexBuildMetadataArtifact(): Promise<SearchIndexBuildMetadata | null> {
  const payload = await getSearchIndexArtifact("build-metadata");
  if (!payload) {
    return null;
  }

  return searchIndexBuildMetadataSchema.parse(payload);
}
