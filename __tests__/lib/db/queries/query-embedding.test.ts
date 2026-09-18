/**
 * buildQueryEmbedding: a request-level context owns the embedding decision.
 * With a context present the endpoint is never called, whether or not the
 * context carries a vector; without one the query is embedded once.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONTENT_EMBEDDING_DIMENSIONS } from "@/lib/db/schema/content-embeddings";

const { mockEmbedTexts } = vi.hoisted(() => ({ mockEmbedTexts: vi.fn() }));
vi.mock("@/lib/ai/openai-compatible/embeddings-client", () => ({
  embedTextsWithEndpointCompatibleModel: mockEmbedTexts,
}));
vi.mock("@/lib/ai/openai-compatible/feature-config", () => ({
  resolveDefaultEndpointCompatibleEmbeddingConfig: () => ({
    baseUrl: "https://embeddings.test/v1",
    apiKey: "test",
    embeddingSpaceId: "test-space",
    model: "test-model",
  }),
}));

import { buildQueryEmbedding } from "@/lib/db/queries/query-embedding";

const vector = Array.from({ length: CONTENT_EMBEDDING_DIMENSIONS }, () => 0.5);

describe("buildQueryEmbedding", () => {
  beforeEach(() => {
    mockEmbedTexts.mockReset();
    mockEmbedTexts.mockResolvedValue([vector]);
  });

  it("returns the precomputed vector without calling the endpoint", async () => {
    await expect(buildQueryEmbedding("postgres", "[test]", { precomputed: vector })).resolves.toBe(
      vector,
    );
    expect(mockEmbedTexts).not.toHaveBeenCalled();
  });

  it("stays keyword-only for every domain when the request-level embedding is absent", async () => {
    await expect(
      buildQueryEmbedding("postgres", "[test]", { precomputed: undefined }),
    ).resolves.toBeUndefined();
    expect(mockEmbedTexts).not.toHaveBeenCalled();
  });

  it("embeds the query once when no context is supplied", async () => {
    await expect(buildQueryEmbedding("postgres", "[test]")).resolves.toEqual(vector);
    expect(mockEmbedTexts).toHaveBeenCalledTimes(1);
    expect(mockEmbedTexts).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 4_000 }));
  });

  it("bounds the request by the caller's budget when one is given", async () => {
    // RAG awaits this before its scope searches, so its own per-scope budget has
    // to cap the embedding too or the advertised latency is exceeded before any
    // scope timeout applies.
    await expect(buildQueryEmbedding("postgres", "[test]", undefined, 3_000)).resolves.toEqual(
      vector,
    );
    expect(mockEmbedTexts).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 3_000 }));
  });
});
