/**
 * Content Graph Artifact Mutations
 * @module lib/db/mutations/content-graph
 * @description
 * Write operations for content graph artifacts stored in PostgreSQL.
 * All mutations call assertDatabaseWriteAllowed() before writing.
 */

import { assertDatabaseWriteAllowed, db } from "@/lib/db/connection";
import { CONTENT_GRAPH_ARTIFACT_TYPES, contentGraphArtifacts } from "@/lib/db/schema/content-graph";

/**
 * Upsert a single content graph artifact.
 * Inserts or updates the row for the given artifact type.
 */
export async function writeContentGraphArtifact(
  artifactType: (typeof CONTENT_GRAPH_ARTIFACT_TYPES)[number],
  payload: Record<string, unknown>,
): Promise<void> {
  assertDatabaseWriteAllowed(`writeContentGraphArtifact:${artifactType}`);

  const generatedAt = new Date().toISOString();
  const updatedAt = Date.now();

  await db
    .insert(contentGraphArtifacts)
    .values({
      artifactType,
      payload,
      generatedAt,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: contentGraphArtifacts.artifactType,
      set: {
        payload,
        generatedAt,
        updatedAt,
      },
    });
}

/**
 * Batch upsert multiple content graph artifacts.
 * Used by build.ts to write all artifacts in one operation.
 */
export async function writeContentGraphArtifacts(
  artifacts: Array<{
    artifactType: (typeof CONTENT_GRAPH_ARTIFACT_TYPES)[number];
    payload: Record<string, unknown>;
  }>,
): Promise<void> {
  await Promise.all(
    artifacts.map((artifact) => writeContentGraphArtifact(artifact.artifactType, artifact.payload)),
  );
}
