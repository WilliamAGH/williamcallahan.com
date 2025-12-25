/**
 * Chroma Sync Operations for Thoughts
 * @module lib/thoughts/chroma-sync
 *
 * Provides sync operations between the Thoughts primary store and Chroma vector store.
 * Chroma serves as a derived index for semantic queries - the primary store (JSON/S3)
 * remains the source of truth for content.
 *
 * Key design decisions:
 * - Per-type collection ("thoughts") for independent lifecycle management
 * - Tags stored as comma-separated string (Chroma doesn't support array metadata)
 * - Empty strings for optional fields (Chroma requires consistent types)
 * - contentType field enables future cross-collection queries
 */

import { getChromaClient } from "@/lib/chroma/client";
import type { Thought } from "@/types/schemas/thought";
import type { ThoughtChromaMetadata } from "@/types/thoughts-chroma";
import type { Collection, EmbeddingFunction } from "chromadb";

// Re-export for convenience
export type { ThoughtChromaMetadata } from "@/types/thoughts-chroma";

/** Collection name for thoughts in Chroma */
const COLLECTION_NAME = "thoughts";

/** Collection metadata version - increment when schema changes require re-embedding */
const COLLECTION_VERSION = "1";

/**
 * Singleton embedding function instance.
 * Uses ONNX-based MiniLM-L6-v2 model that runs locally without API calls.
 * Loaded dynamically to avoid Turbopack bundling issues with native ONNX bindings.
 *
 * IMPORTANT: This requires glibc. Alpine Linux (musl) is NOT supported.
 * If you see "symbol not found" errors, switch to a Debian-based Docker image
 * or use @chroma-core/openai for API-based embeddings.
 */
let embeddingFunction: EmbeddingFunction | null = null;

/**
 * Error thrown when embedding function fails to load.
 * Provides actionable guidance for common failure scenarios.
 */
class EmbeddingFunctionError extends Error {
  constructor(cause: unknown) {
    const originalMessage = cause instanceof Error ? cause.message : String(cause);
    const isMuslError = originalMessage.includes("symbol not found") || originalMessage.includes("libonnxruntime");

    const guidance = isMuslError
      ? "ONNX runtime requires glibc. Alpine Linux (musl) is not supported. " +
        "Options: (1) Use Debian-based Docker image, (2) Install @chroma-core/openai for API-based embeddings"
      : "Failed to load embedding function. Ensure @chroma-core/default-embed is installed.";

    super(`[Chroma] ${guidance} Original error: ${originalMessage}`);
    this.name = "EmbeddingFunctionError";
  }
}

async function getEmbeddingFunction(): Promise<EmbeddingFunction> {
  if (!embeddingFunction) {
    try {
      // Dynamic import to avoid build-time evaluation of ONNX native bindings
      const { DefaultEmbeddingFunction } = await import("@chroma-core/default-embed");
      embeddingFunction = new DefaultEmbeddingFunction();
    } catch (error) {
      throw new EmbeddingFunctionError(error);
    }
  }
  return embeddingFunction;
}

/**
 * Gets or creates the thoughts collection with standard configuration.
 * Uses the DefaultEmbeddingFunction for local ONNX-based embeddings.
 *
 * @returns Configured thoughts collection
 */
export async function getThoughtsCollection(): Promise<Collection> {
  const client = getChromaClient();
  const ef = await getEmbeddingFunction();
  return client.getOrCreateCollection({
    name: COLLECTION_NAME,
    metadata: {
      description: "Short-form content embeddings for semantic discovery",
      contentType: "thought",
      version: COLLECTION_VERSION,
    },
    embeddingFunction: ef,
  });
}

/**
 * Converts a Thought to the document text used for embedding.
 * Combines title and content for full semantic capture.
 *
 * @param thought - The thought to convert
 * @returns Document text for embedding
 */
function toDocumentText(thought: Thought): string {
  return `${thought.title}\n\n${thought.content}`;
}

/**
 * Converts a Thought to Chroma metadata format.
 * Handles Chroma's limitations (no arrays, consistent types).
 *
 * @param thought - The thought to convert
 * @returns Metadata object for Chroma
 */
function toChromaMetadata(thought: Thought): ThoughtChromaMetadata {
  return {
    slug: thought.slug,
    title: thought.title,
    category: thought.category ?? "",
    tags: thought.tags?.join(",") ?? "",
    createdAt: thought.createdAt,
    updatedAt: thought.updatedAt ?? thought.createdAt,
    draft: thought.draft ?? false,
    contentType: "thought",
  };
}

/**
 * Syncs a single thought to Chroma (upsert operation).
 * Call this on thought create or update.
 *
 * @param thought - The thought to sync
 */
export async function syncThoughtToChroma(thought: Thought): Promise<void> {
  const collection = await getThoughtsCollection();

  await collection.upsert({
    ids: [thought.id],
    documents: [toDocumentText(thought)],
    metadatas: [toChromaMetadata(thought)],
  });
}

/**
 * Syncs multiple thoughts to Chroma in a single batch operation.
 * More efficient than individual syncs for bulk updates.
 *
 * @param thoughts - Array of thoughts to sync
 */
export async function syncThoughtsToChroma(thoughts: Thought[]): Promise<void> {
  if (thoughts.length === 0) return;

  const collection = await getThoughtsCollection();

  await collection.upsert({
    ids: thoughts.map(t => t.id),
    documents: thoughts.map(toDocumentText),
    metadatas: thoughts.map(toChromaMetadata),
  });
}

/**
 * Removes a thought from Chroma.
 * Call this when a thought is deleted from the primary store.
 *
 * @param thoughtId - UUID of the thought to remove
 */
export async function removeThoughtFromChroma(thoughtId: string): Promise<void> {
  const collection = await getThoughtsCollection();
  await collection.delete({ ids: [thoughtId] });
}

/**
 * Removes multiple thoughts from Chroma in a single batch operation.
 *
 * @param thoughtIds - Array of UUIDs to remove
 */
export async function removeThoughtsFromChroma(thoughtIds: string[]): Promise<void> {
  if (thoughtIds.length === 0) return;

  const collection = await getThoughtsCollection();
  await collection.delete({ ids: thoughtIds });
}

/**
 * Full sync: clear and repopulate from source of truth.
 * Use sparingly - for rebuilds, migrations, or embedding model changes.
 *
 * @param thoughts - All thoughts from primary store
 * @param options - Sync options
 * @param options.includeDrafts - Whether to include draft thoughts (default: false)
 */
export async function fullSyncThoughtsToChroma(
  thoughts: Thought[],
  options: { includeDrafts?: boolean } = {},
): Promise<{ synced: number; skipped: number }> {
  const { includeDrafts = false } = options;
  const collection = await getThoughtsCollection();

  // Delete all existing documents in batches (respects Chroma free tier limits)
  const batchSize = 100;
  let hasMore = true;

  while (hasMore) {
    const existing = await collection.get({ limit: batchSize });
    if (existing.ids.length > 0) {
      await collection.delete({ ids: existing.ids });
    }
    hasMore = existing.ids.length === batchSize;
  }

  // Filter thoughts based on options
  const thoughtsToSync = includeDrafts ? thoughts : thoughts.filter(t => !t.draft);

  if (thoughtsToSync.length === 0) {
    return { synced: 0, skipped: thoughts.length };
  }

  await collection.add({
    ids: thoughtsToSync.map(t => t.id),
    documents: thoughtsToSync.map(toDocumentText),
    metadatas: thoughtsToSync.map(toChromaMetadata),
  });

  return {
    synced: thoughtsToSync.length,
    skipped: thoughts.length - thoughtsToSync.length,
  };
}

/**
 * Gets the current count of thoughts in Chroma.
 * Useful for monitoring and debugging sync status.
 *
 * @returns Number of thoughts in the collection
 */
export async function getThoughtsChromaCount(): Promise<number> {
  const collection = await getThoughtsCollection();
  return collection.count();
}

/**
 * Checks if a specific thought exists in Chroma.
 *
 * @param thoughtId - UUID of the thought to check
 * @returns True if the thought exists in Chroma
 */
export async function thoughtExistsInChroma(thoughtId: string): Promise<boolean> {
  const collection = await getThoughtsCollection();
  const result = await collection.get({ ids: [thoughtId] });
  return result.ids.length > 0;
}
