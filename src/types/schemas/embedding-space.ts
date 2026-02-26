import { z } from "zod/v4";

/**
 * Canonical embedding space identifier.
 *
 * This is NOT a provider model id. Provider-specific model ids are routing strings
 * (for example, `text-embedding-qwen3-embedding-4b` vs `qwen/qwen3-embedding-4b`)
 * that can refer to the same underlying embedding space.
 */
export const embeddingSpaceIdSchema = z.enum(["qwen3-embedding-4b"]);

export type EmbeddingSpaceId = z.infer<typeof embeddingSpaceIdSchema>;
