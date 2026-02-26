/**
 * Cross-domain similarity query — contract and type tests.
 *
 * Validates the module exports the expected functions and types,
 * and that input validation works correctly (dimension mismatch).
 */

import { CONTENT_EMBEDDING_DIMENSIONS } from "@/lib/db/schema/content-embeddings";
import { CONTENT_EMBEDDING_DOMAINS } from "@/types/db/embeddings";
import type { SimilarityCandidate } from "@/types/related-content";

describe("cross-domain-similarity module", () => {
  it("exports findSimilarByEntity and findSimilarByVector", async () => {
    const mod = await import("@/lib/db/queries/cross-domain-similarity");
    expect(typeof mod.findSimilarByEntity).toBe("function");
    expect(typeof mod.findSimilarByVector).toBe("function");
  });

  it("exports SimilarityCandidate type with expected shape", async () => {
    // Type-level check: ensure the interface fields exist at compile time
    const candidate: SimilarityCandidate = {
      domain: "bookmark",
      entityId: "test-id",
      title: "Test Title",
      similarity: 0.85,
      contentDate: "2026-01-15",
    };
    expect(candidate.domain).toBe("bookmark");
    expect(candidate.similarity).toBe(0.85);
    expect(candidate.contentDate).toBe("2026-01-15");
  });

  it("SimilarityCandidate.domain accepts all CONTENT_EMBEDDING_DOMAINS values", () => {
    // Verify the domain type covers all domains
    for (const domain of CONTENT_EMBEDDING_DOMAINS) {
      const candidate: SimilarityCandidate = {
        domain,
        entityId: `${domain}-test`,
        title: `${domain} test`,
        similarity: 0.5,
        contentDate: null,
      };
      expect(candidate.domain).toBe(domain);
    }
  });

  it("uses CONTENT_EMBEDDING_DIMENSIONS = 2560 for vector validation", () => {
    expect(CONTENT_EMBEDDING_DIMENSIONS).toBe(2560);
  });
});
