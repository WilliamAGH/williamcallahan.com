/**
 * Chroma Embedding Error Handler
 * @module lib/chroma/embedding-error
 *
 * Provides typed error handling for embedding function failures,
 * with actionable guidance for common failure scenarios.
 */

/**
 * Error patterns that indicate musl libc incompatibility.
 * ONNX runtime requires glibc; Alpine Linux uses musl which is incompatible.
 */
const MUSL_ERROR_PATTERNS = ["symbol not found", "libonnxruntime"] as const;

/**
 * Check if an error message indicates a musl/glibc incompatibility.
 */
function isMuslCompatibilityError(message: string): boolean {
  return MUSL_ERROR_PATTERNS.some(pattern => message.includes(pattern));
}

/**
 * Error thrown when embedding function fails to load.
 * Provides actionable guidance for common failure scenarios.
 *
 * @example
 * ```ts
 * try {
 *   const { DefaultEmbeddingFunction } = await import("@chroma-core/default-embed");
 * } catch (error) {
 *   throw new EmbeddingFunctionError(error);
 * }
 * ```
 */
export class EmbeddingFunctionError extends Error {
  constructor(cause: unknown) {
    const originalMessage = cause instanceof Error ? cause.message : String(cause);

    const guidance = isMuslCompatibilityError(originalMessage)
      ? "ONNX runtime requires glibc. Alpine Linux (musl) is not supported. " +
        "Options: (1) Use Debian-based Docker image, (2) Install @chroma-core/openai for API-based embeddings"
      : "Failed to load embedding function. Ensure @chroma-core/default-embed is installed.";

    super(`[Chroma] ${guidance} Original error: ${originalMessage}`);
    this.name = "EmbeddingFunctionError";
  }
}
