/**
 * Content Graph Artifact Queries
 * @module lib/db/queries/content-graph
 * @description
 * Read-only queries for content graph artifacts stored in PostgreSQL.
 * Each artifact type stores its full payload as JSONB.
 */

import { eq } from "drizzle-orm";
import type { ZodIssue } from "zod/v4";
import { db } from "@/lib/db/connection";
import { CONTENT_GRAPH_ARTIFACT_TYPES, contentGraphArtifacts } from "@/lib/db/schema/content-graph";
import { relatedContentGraphSchema, booksRelatedContentDataSchema } from "@/types/schemas/book";
import {
  tagGraphSchema,
  contentGraphBuildMetadataSchema,
  type ContentGraphBuildMetadata,
  type TagGraph,
} from "@/types/schemas/related-content";
import type { BooksRelatedContent, RelatedContentGraph } from "@/types/schemas/book";

let invalidRelatedContentArtifactLogged = false;

function formatZodIssuePath(issue: ZodIssue): string {
  return issue.path.length > 0 ? issue.path.map(String).join(".") : "<root>";
}

function logInvalidRelatedContentArtifact(issues: readonly ZodIssue[]): void {
  if (invalidRelatedContentArtifactLogged) {
    return;
  }
  invalidRelatedContentArtifactLogged = true;
  const summary = issues
    .slice(0, 5)
    .map((issue) => `${formatZodIssuePath(issue)}: ${issue.message}`)
    .join("; ");
  console.warn(
    `[db/queries/content-graph] Invalid related-content artifact; falling back to on-demand related-content. issues=${issues.length}; first=${summary}`,
  );
}

/**
 * Read a single content graph artifact by type.
 * Returns the raw JSONB payload or null when not found.
 */
export async function readContentGraphArtifact(
  artifactType: (typeof CONTENT_GRAPH_ARTIFACT_TYPES)[number],
): Promise<Record<string, unknown> | null> {
  const rows = await db
    .select({ payload: contentGraphArtifacts.payload })
    .from(contentGraphArtifacts)
    .where(eq(contentGraphArtifacts.artifactType, artifactType))
    .limit(1);

  const firstRow = rows[0];
  if (!firstRow) {
    return null;
  }

  return firstRow.payload;
}

/**
 * Read the pre-computed related content mapping.
 * Returns a validated mapping of contentKey -> related items, or null.
 */
export async function readRelatedContent(): Promise<RelatedContentGraph | null> {
  const payload = await readContentGraphArtifact("related-content");
  if (!payload) {
    return null;
  }

  const parsed = relatedContentGraphSchema.safeParse(payload);
  if (!parsed.success) {
    logInvalidRelatedContentArtifact(parsed.error.issues);
    return null;
  }
  return parsed.data;
}

/**
 * Read the books-specific related content dataset.
 * Returns the full validated BooksRelatedContent, or null.
 */
export async function readBooksRelatedContent(): Promise<BooksRelatedContent | null> {
  const payload = await readContentGraphArtifact("books-related");
  if (!payload) {
    return null;
  }

  return booksRelatedContentDataSchema.parse(payload);
}

/**
 * Read the tag co-occurrence graph.
 * Returns the Zod-validated TagGraph structure, or null.
 */
export async function readTagGraph(): Promise<TagGraph | null> {
  const payload = await readContentGraphArtifact("tag-graph");
  if (!payload) {
    return null;
  }

  return tagGraphSchema.parse(payload);
}

/**
 * Read the content graph build metadata.
 * Returns the Zod-validated metadata object or null when not yet built.
 */
export async function readContentGraphMetadata(): Promise<ContentGraphBuildMetadata | null> {
  const payload = await readContentGraphArtifact("metadata");
  if (!payload) {
    return null;
  }

  return contentGraphBuildMetadataSchema.parse(payload);
}
