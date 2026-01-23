/**
 * Shared Chroma Embedding Function
 * @module lib/chroma/embedding-function
 *
 * Provides a thread-safe singleton embedding function for Chroma vector operations.
 * Used by both books and thoughts sync modules.
 *
 * Key design decisions:
 * - Promise-based initialization guard prevents race conditions during lazy init
 * - Singleton pattern ensures only one embedding function instance exists
 * - Dynamic import avoids Turbopack bundling issues with native ONNX bindings
 * - Reset on failure allows retry after transient errors
 */

import { EmbeddingFunctionError } from "@/lib/chroma/embedding-error";
import type { EmbeddingFunction } from "chromadb";

/**
 * Cached singleton embedding function instance.
 * Once initialized successfully, this reference is reused for all subsequent calls.
 */
let embeddingFunction: EmbeddingFunction | null = null;

/**
 * Promise tracking the initialization in progress.
 * Prevents multiple concurrent callers from each starting their own initialization.
 *
 * Pattern: When first caller starts init, they set this promise. Subsequent callers
 * see the promise and await it instead of starting their own init. On success,
 * embeddingFunction is populated. On failure, this is reset to null to allow retry.
 */
let embeddingFunctionPromise: Promise<EmbeddingFunction> | null = null;

/**
 * Get or initialize the singleton embedding function.
 *
 * Uses ONNX-based MiniLM-L6-v2 model that runs locally without API calls.
 * Handles concurrent initialization safely by tracking the initialization promise.
 *
 * IMPORTANT: This requires glibc. Alpine Linux (musl) is NOT supported.
 * If you see "symbol not found" errors, switch to a Debian-based Docker image
 * or use @chroma-core/openai for API-based embeddings.
 *
 * @returns The singleton embedding function instance
 * @throws {EmbeddingFunctionError} If the embedding function fails to load
 *
 * @example
 * ```ts
 * const ef = await getEmbeddingFunction();
 * const collection = await client.getOrCreateCollection({
 *   name: "my-collection",
 *   embeddingFunction: ef,
 * });
 * ```
 */
export async function getEmbeddingFunction(): Promise<EmbeddingFunction> {
  // Fast path: already initialized
  if (embeddingFunction) {
    return embeddingFunction;
  }

  // Another caller is initializing - wait for them
  if (embeddingFunctionPromise) {
    return embeddingFunctionPromise;
  }

  // We're the first caller - start initialization
  embeddingFunctionPromise = (async () => {
    try {
      // Dynamic import to avoid build-time evaluation of ONNX native bindings
      const { DefaultEmbeddingFunction } = await import("@chroma-core/default-embed");
      embeddingFunction = new DefaultEmbeddingFunction();
      return embeddingFunction;
    } catch (error) {
      // Reset promise on failure to allow retry on next call
      embeddingFunctionPromise = null;
      throw new EmbeddingFunctionError(error);
    }
  })();

  return embeddingFunctionPromise;
}
