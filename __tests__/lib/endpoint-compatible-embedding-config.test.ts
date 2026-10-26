import {
  embedTextsWithEndpointCompatibleModel,
  getEndpointCompatibleEmbeddingRetryAfterMilliseconds,
  resolveEndpointCompatibleEmbeddingTimeoutMs,
} from "@/lib/ai/openai-compatible/embeddings-client";
import { resolveDefaultEndpointCompatibleEmbeddingConfig } from "@/lib/ai/openai-compatible/feature-config";
import {
  endpointCompatibleEmbeddingsRequestSchema,
  openAiCompatibleWorkloadSchema,
  queryEmbeddingPurposeSchema,
  type EndpointCompatibleEmbeddingConfig,
  type EndpointCompatibleEmbeddingsRequest,
} from "@/types/schemas/ai-openai-compatible";
import { CONTENT_EMBEDDING_DOMAINS } from "@/types/db/embeddings";

const embeddingConfig: EndpointCompatibleEmbeddingConfig = {
  model: "text-embedding-qwen3-embedding-4b",
  baseUrl: "https://example.test",
  apiKey: "test-key",
  embeddingSpaceId: "qwen3-embedding-4b",
};

function readEmbeddingRequest(init: RequestInit | undefined): EndpointCompatibleEmbeddingsRequest {
  const body = init?.body;
  if (typeof body !== "string") {
    throw new TypeError("Expected stringified embedding request body.");
  }
  const parsed: unknown = JSON.parse(body);
  return endpointCompatibleEmbeddingsRequestSchema.parse(parsed);
}

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
    vi.useRealTimers();
    vi.unstubAllGlobals();
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
      embeddingSpaceId: "qwen3-embedding-4b",
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

describe("embedTextsWithEndpointCompatibleModel", () => {
  it.each([
    ...queryEmbeddingPurposeSchema.options.map(
      (purpose) => `williamcallahan.com:${purpose}SearchEmbedding:live` as const,
    ),
    ...CONTENT_EMBEDDING_DOMAINS.map(
      (domain) => `williamcallahan.com:${domain}IndexEmbedding:batch` as const,
    ),
  ])("sends the semantic embedding workload %s over HTTP", async (workload) => {
    const parsedWorkload = openAiCompatibleWorkloadSchema.parse(workload);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (_request, init) => {
        expect(new Headers(init?.headers).get("X-User-ID")).toBe(workload);
        return Response.json({
          object: "list",
          data: [{ object: "embedding", embedding: [1, 2], index: 0 }],
        });
      }),
    );
    await expect(
      embedTextsWithEndpointCompatibleModel({
        config: embeddingConfig,
        input: ["semantic purpose"],
        tier: workload.endsWith(":batch") ? "batch" : "production-z",
        workload: parsedWorkload,
      }),
    ).resolves.toEqual([[1, 2]]);
  });

  it.each([
    "chat-completions:live",
    "embeddings:live",
    "embeddings:batch",
    "chat-completions:batch",
    "unknown:live",
  ])("rejects generic or unknown workload %s", (suffix) => {
    expect(openAiCompatibleWorkloadSchema.safeParse(`williamcallahan.com:${suffix}`).success).toBe(
      false,
    );
  });

  it("accepts the bookmark tag alias job", () => {
    expect(
      openAiCompatibleWorkloadSchema.parse("williamcallahan.com:bookmarkTagAliases:batch"),
    ).toBe("williamcallahan.com:bookmarkTagAliases:batch");
  });

  it("preserves OpenAI embedding response order by index", async () => {
    const requests: EndpointCompatibleEmbeddingsRequest[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("X-Tier")).toBe("batch");
      expect(headers.get("X-User-ID")).toBe("williamcallahan.com:bookmarkIndexEmbedding:batch");
      const request = readEmbeddingRequest(init);
      requests.push(request);
      const data = request.input
        .map((_, index) => ({
          object: "embedding",
          embedding: [index, 10 - index],
          index,
        }))
        .toReversed();
      return Response.json({ object: "list", data });
    });
    vi.stubGlobal("fetch", fetchMock);

    const embeddings = await embedTextsWithEndpointCompatibleModel({
      config: embeddingConfig,
      input: ["alpha", "beta"],
      tier: "batch",
      workload: "williamcallahan.com:bookmarkIndexEmbedding:batch",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(requests[0]).toMatchObject({
      model: "text-embedding-qwen3-embedding-4b",
      input: ["alpha", "beta"],
    });
    expect(embeddings).toEqual([
      [0, 10],
      [1, 9],
    ]);
  });

  it("splits oversized logical inputs and pools chunk vectors", async () => {
    const requests: EndpointCompatibleEmbeddingsRequest[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = readEmbeddingRequest(init);
      requests.push(request);
      const vectors = [
        [1, 0],
        [0, 1],
        [0, 2],
      ];
      const data = request.input.map((_, index) => {
        const embedding = vectors[index];
        if (!embedding) throw new Error(`Missing test embedding for index ${index}.`);
        return { object: "embedding", embedding, index };
      });
      return Response.json({ object: "list", data });
    });
    vi.stubGlobal("fetch", fetchMock);

    const embeddings = await embedTextsWithEndpointCompatibleModel({
      config: embeddingConfig,
      input: ["a".repeat(32_769), "short"],
      tier: "batch",
      workload: "williamcallahan.com:bookmarkIndexEmbedding:batch",
    });

    expect(requests[0]?.input).toHaveLength(3);
    expect(embeddings).toHaveLength(2);
    expect(embeddings[0]?.[0]).toBeCloseTo(Math.SQRT1_2);
    expect(embeddings[0]?.[1]).toBeCloseTo(Math.SQRT1_2);
    expect(embeddings[1]).toEqual([0, 2]);
  });

  it("grows the request deadline with payload size so large batches are not aborted", () => {
    // A 16-row bookmark batch reaches ~500 000 chars, which the endpoint serves
    // at ~3 400 chars/s (~150 s). A fixed 30 s deadline aborted every such batch.
    const smallBatch = ["short query"];
    const largeBatch = Array.from({ length: 16 }, () => "a".repeat(31_250));

    expect(resolveEndpointCompatibleEmbeddingTimeoutMs(smallBatch)).toBe(30_000);
    expect(resolveEndpointCompatibleEmbeddingTimeoutMs(largeBatch)).toBeGreaterThan(150_000);
    // An explicit caller bound still wins, so interactive search stays short.
    expect(resolveEndpointCompatibleEmbeddingTimeoutMs(largeBatch, 1_500)).toBe(1_500);
  });

  it("retries a transient endpoint timeout only when a retry policy is supplied", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"))
      .mockResolvedValueOnce(
        Response.json({
          object: "list",
          data: [{ object: "embedding", embedding: [1, 2], index: 0 }],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      embedTextsWithEndpointCompatibleModel({
        config: embeddingConfig,
        input: ["alpha"],
        tier: "batch",
        workload: "williamcallahan.com:bookmarkIndexEmbedding:batch",
        retry: { maxRetries: 1, baseDelayMs: 0, maxDelayMs: 0 },
      }),
    ).resolves.toEqual([[1, 2]]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("honors Retry-After before retrying a rate-limited endpoint", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("capacity exhausted", {
          status: 429,
          headers: { "Retry-After": "1" },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          object: "list",
          data: [{ object: "embedding", embedding: [3, 4], index: 0 }],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const embeddings = embedTextsWithEndpointCompatibleModel({
      config: embeddingConfig,
      input: ["alpha"],
      tier: "batch",
      workload: "williamcallahan.com:bookmarkIndexEmbedding:batch",
      retry: { maxRetries: 1, baseDelayMs: 0, maxDelayMs: 2_000 },
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);

    await expect(embeddings).resolves.toEqual([[3, 4]]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([429, 400])("does not retry HTTP %s before a long Retry-After", async (status) => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () =>
          new Response("capacity exhausted", { status, headers: { "Retry-After": "60" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const outcome = embedTextsWithEndpointCompatibleModel({
        config: embeddingConfig,
        input: ["alpha"],
        tier: "batch",
        workload: "williamcallahan.com:bookmarkIndexEmbedding:batch",
        retry: { maxRetries: 2, baseDelayMs: 1_000, maxDelayMs: 15_000 },
      }).catch((error: unknown) => error);
      await vi.runAllTimersAsync();
      const error = await outcome;
      expect(error).toMatchObject({ status, message: expect.stringContaining(`HTTP ${status}`) });
      expect(getEndpointCompatibleEmbeddingRetryAfterMilliseconds(error)).toBe(60_000);
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("returns bounded upstream context for a terminal HTTP error", async () => {
    const responseBody = `provider overload: ${"x".repeat(600)}`;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(new Response(responseBody, { status: 400 })),
    );

    let thrown: unknown;
    try {
      await embedTextsWithEndpointCompatibleModel({
        config: embeddingConfig,
        input: ["alpha"],
        tier: "batch",
        workload: "williamcallahan.com:bookmarkIndexEmbedding:batch",
      });
    } catch (error) {
      thrown = error;
    }

    if (!(thrown instanceof Error)) throw new Error("Expected an endpoint error.");
    expect(thrown.message).toContain("provider overload:");
    expect(thrown.message).not.toContain("x".repeat(513));
  });
});
