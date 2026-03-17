import { createHash } from "node:crypto";
import { assertDatabaseWriteAllowed, db } from "@/lib/db/connection";
import { searchIndexArtifacts } from "@/lib/db/schema/bookmark-taxonomy";
import {
  allSerializedIndexesSchema,
  searchIndexArtifactPayloadSchema,
  searchIndexBuildMetadataSchema,
  serializedIndexSchema,
  type AllSerializedIndexes,
  type SearchIndexArtifactDomain,
  type SearchIndexArtifact,
} from "@/types/schemas/search";

const normalizeArtifactPayload = (
  domain: SearchIndexArtifactDomain,
  payload: SearchIndexArtifact,
): SearchIndexArtifact => {
  if (domain === "build-metadata") {
    return searchIndexBuildMetadataSchema.parse(payload);
  }

  return serializedIndexSchema.parse(payload);
};

const resolveArtifactMetadata = (
  domain: SearchIndexArtifactDomain,
  payload: SearchIndexArtifact,
): { generatedAt: string; itemCount: number } => {
  if (domain === "build-metadata") {
    const metadata = searchIndexBuildMetadataSchema.parse(payload);
    return {
      generatedAt: metadata.buildTime,
      itemCount: 0,
    };
  }

  const serialized = serializedIndexSchema.parse(payload);
  return {
    generatedAt: serialized.metadata.buildTime,
    itemCount: serialized.metadata.itemCount,
  };
};

const computeArtifactChecksum = (payload: SearchIndexArtifact): string =>
  createHash("md5").update(JSON.stringify(payload)).digest("hex");

export async function upsertSearchIndexArtifact(
  domain: SearchIndexArtifactDomain,
  payload: SearchIndexArtifact,
): Promise<void> {
  assertDatabaseWriteAllowed(`upsertSearchIndexArtifact:${domain}`);

  const normalizedPayload = normalizeArtifactPayload(domain, payload);
  const { generatedAt, itemCount } = resolveArtifactMetadata(domain, normalizedPayload);
  const checksum = computeArtifactChecksum(normalizedPayload);
  const updatedAt = Date.now();

  await db
    .insert(searchIndexArtifacts)
    .values({
      domain,
      payload: searchIndexArtifactPayloadSchema.parse(normalizedPayload),
      checksum,
      itemCount,
      generatedAt,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: searchIndexArtifacts.domain,
      set: {
        payload: searchIndexArtifactPayloadSchema.parse(normalizedPayload),
        checksum,
        itemCount,
        generatedAt,
        updatedAt,
      },
    });
}

export async function upsertAllSearchIndexArtifacts(indexes: AllSerializedIndexes): Promise<void> {
  const validatedIndexes = allSerializedIndexesSchema.parse(indexes);

  const artifactEntries: Array<{
    domain: SearchIndexArtifactDomain;
    payload: SearchIndexArtifact;
  }> = [
    { domain: "posts", payload: validatedIndexes.posts },
    { domain: "investments", payload: validatedIndexes.investments },
    { domain: "experience", payload: validatedIndexes.experience },
    { domain: "education", payload: validatedIndexes.education },
    { domain: "projects", payload: validatedIndexes.projects },
    { domain: "bookmarks", payload: validatedIndexes.bookmarks },
    { domain: "books", payload: validatedIndexes.books },
    { domain: "build-metadata", payload: validatedIndexes.buildMetadata },
  ];

  await Promise.all(
    artifactEntries.map((artifact) => upsertSearchIndexArtifact(artifact.domain, artifact.payload)),
  );
}
