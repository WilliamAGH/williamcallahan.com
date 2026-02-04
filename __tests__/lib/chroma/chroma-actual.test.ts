/** @vitest-environment node */
/**
 * @file Live Chroma integration test (opt-in)
 * @module __tests__/lib/chroma/chroma-actual.test
 *
 * Exercises real Chroma Cloud operations when CHROMA_* env vars are configured.
 * Uses explicit embeddings to avoid local ONNX initialization in tests.
 */

import { randomUUID } from "node:crypto";
import type { Include } from "chromadb";
import { z } from "zod/v4";
import { getChromaClient } from "@/lib/chroma/client";

const ChromaEnvSchema = z
  .object({
    CHROMA_API_KEY: z.string().min(1),
    CHROMA_TENANT: z.string().uuid(),
    CHROMA_DATABASE: z.string().min(1),
  })
  .passthrough();

const shouldRunLiveTests = ChromaEnvSchema.safeParse(process.env).success;

describe.runIf(shouldRunLiveTests)("Chroma Integration – live", () => {
  const collectionName = `test_integration_${randomUUID()}`;
  const documentId = `doc_${randomUUID()}`;
  const include: Include[] = ["documents", "metadatas"];
  const embedding = [0.1, 0.2, 0.3];
  let client: ReturnType<typeof getChromaClient> | null = null;
  let collectionCreated = false;

  afterAll(async () => {
    if (!client || !collectionCreated) return;
    await client.deleteCollection({ name: collectionName });
  });

  it("creates, upserts, reads, queries, and deletes a collection", async () => {
    client = getChromaClient();
    const collection = await client.getOrCreateCollection({
      name: collectionName,
      embeddingFunction: null,
      metadata: { source: "integration-test" },
    });
    collectionCreated = true;

    await collection.upsert({
      ids: [documentId],
      embeddings: [embedding],
      documents: ["Integration test document"],
      metadatas: [{ source: "integration-test" }],
    });

    const fetched = await collection.get({ ids: [documentId], include });
    expect(fetched.ids).toEqual([documentId]);
    expect(fetched.documents?.[0]).toBe("Integration test document");
    expect(fetched.metadatas?.[0]).toMatchObject({ source: "integration-test" });

    const count = await collection.count();
    expect(count).toBeGreaterThan(0);

    const results = await collection.query({
      queryEmbeddings: [embedding],
      nResults: 1,
      include,
    });
    expect(results.ids[0]?.[0]).toBe(documentId);
  });
});
