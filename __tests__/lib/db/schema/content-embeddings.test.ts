import { getTableColumns } from "drizzle-orm";
import {
  CONTENT_EMBEDDING_DIMENSIONS,
  CONTENT_EMBEDDING_DOMAINS,
  CONTENT_EMBEDDING_MODEL,
  embeddings,
} from "@/lib/db/schema/content-embeddings";

describe("content-embeddings schema", () => {
  it("enforces 2560 dimensions for Qwen3-Embedding-4B FP16", () => {
    expect(CONTENT_EMBEDDING_DIMENSIONS).toBe(2560);
  });

  it("references the correct model identifier", () => {
    expect(CONTENT_EMBEDDING_MODEL).toBe("Qwen/Qwen3-Embedding-4B");
  });

  it("includes all expected domains", () => {
    const expected = [
      "bookmark",
      "thought",
      "blog",
      "book",
      "investment",
      "project",
      "ai_analysis",
      "opengraph",
    ];
    for (const domain of expected) {
      expect(CONTENT_EMBEDDING_DOMAINS).toContain(domain);
    }
    expect(CONTENT_EMBEDDING_DOMAINS).toHaveLength(expected.length);
  });

  it("defines expected columns on the table", () => {
    const columns = getTableColumns(embeddings);
    const columnNames = Object.keys(columns);

    expect(columnNames).toContain("domain");
    expect(columnNames).toContain("entityId");
    expect(columnNames).toContain("title");
    expect(columnNames).toContain("embeddingText");
    expect(columnNames).toContain("contentDate");
    expect(columnNames).toContain("qwen4bFp16Embedding");
    expect(columnNames).toContain("updatedAt");
  });
});
