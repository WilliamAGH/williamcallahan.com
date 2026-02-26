import { resolveDefaultEndpointCompatibleEmbeddingConfig } from "@/lib/ai/openai-compatible/feature-config";

describe("resolveDefaultEndpointCompatibleEmbeddingConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AI_DEFAULT_EMBEDDING_MODEL;
    delete process.env.AI_DEFAULT_OPENAI_BASE_URL;
    delete process.env.AI_DEFAULT_OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns null when AI_DEFAULT_EMBEDDING_MODEL is unset", () => {
    expect(resolveDefaultEndpointCompatibleEmbeddingConfig()).toBeNull();
  });

  it("returns endpoint-compatible embedding config when all values are present", () => {
    process.env.AI_DEFAULT_EMBEDDING_MODEL = "text-embedding-qwen3-embedding-4b";
    process.env.AI_DEFAULT_OPENAI_BASE_URL = "https://example.test";
    process.env.AI_DEFAULT_OPENAI_API_KEY = "test-key";

    expect(resolveDefaultEndpointCompatibleEmbeddingConfig()).toEqual({
      model: "text-embedding-qwen3-embedding-4b",
      baseUrl: "https://example.test",
      apiKey: "test-key",
    });
  });

  it("throws when model is set but base URL is missing", () => {
    process.env.AI_DEFAULT_EMBEDDING_MODEL = "text-embedding-qwen3-embedding-4b";
    process.env.AI_DEFAULT_OPENAI_API_KEY = "test-key";

    expect(() => resolveDefaultEndpointCompatibleEmbeddingConfig()).toThrow(
      "AI_DEFAULT_EMBEDDING_MODEL is set but AI_DEFAULT_OPENAI_BASE_URL is missing.",
    );
  });

  it("throws when model is set but API key is missing", () => {
    process.env.AI_DEFAULT_EMBEDDING_MODEL = "text-embedding-qwen3-embedding-4b";
    process.env.AI_DEFAULT_OPENAI_BASE_URL = "https://example.test";

    expect(() => resolveDefaultEndpointCompatibleEmbeddingConfig()).toThrow(
      "AI_DEFAULT_EMBEDDING_MODEL is set but AI_DEFAULT_OPENAI_API_KEY is missing.",
    );
  });
});
