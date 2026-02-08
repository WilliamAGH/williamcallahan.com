import {
  createAiGateToken,
  hashUserAgent,
  verifyAiGateToken,
} from "@/lib/ai/openai-compatible/gate-token";
import {
  buildOpenAiApiBaseUrl,
  buildChatCompletionsUrl,
  buildUpstreamQueueKey,
  buildResponsesUrl,
  resolvePreferredUpstreamModel,
  resolveOpenAiCompatibleFeatureConfig,
} from "@/lib/ai/openai-compatible/feature-config";
import { buildChatMessages } from "@/lib/ai/openai-compatible/chat-messages";
import { UpstreamRequestQueue } from "@/lib/ai/openai-compatible/upstream-request-queue";
import { parseLlmJson } from "@/lib/ai/analysis-client-utils";
import {
  resolveModelParams,
  resolveFeatureSystemPrompt,
  isHarmonyFormatModel,
} from "@/app/api/ai/chat/[feature]/feature-defaults";
import { BOOKMARK_ANALYSIS_RESPONSE_FORMAT } from "@/components/features/bookmarks/bookmark-ai-analysis.client";
import { BOOK_ANALYSIS_RESPONSE_FORMAT } from "@/components/features/books/book-ai-analysis.client";
import { PROJECT_ANALYSIS_RESPONSE_FORMAT } from "@/components/features/projects/project-ai-analysis.client";
import { GET as getAiToken } from "@/app/api/ai/token/route";
import { NextRequest } from "next/server";
import type { ParsedRequestBody } from "@/types/schemas/ai-chat";

vi.mock("@/lib/rate-limiter", () => ({
  isOperationAllowed: vi.fn(() => true),
}));

describe("OpenAI-Compatible AI Utilities", () => {
  describe("chat-messages", () => {
    it("respects `system` even when `messages` is provided", () => {
      const messages = buildChatMessages({
        system: "client-system",
        messages: [{ role: "user", content: "hi" }],
      });
      expect(messages).toEqual([
        { role: "system", content: "client-system" },
        { role: "user", content: "hi" },
      ]);
    });

    it("prepends feature system prompt before client system prompt", () => {
      const messages = buildChatMessages({
        featureSystemPrompt: "feature-system",
        system: "client-system",
        messages: [{ role: "user", content: "hi" }],
      });
      expect(messages).toEqual([
        { role: "system", content: "feature-system" },
        { role: "system", content: "client-system" },
        { role: "user", content: "hi" },
      ]);
    });

    it("does not duplicate client `system` when identical system message already exists in `messages`", () => {
      const messages = buildChatMessages({
        system: "client-system",
        messages: [
          { role: "system", content: "client-system" },
          { role: "user", content: "hi" },
        ],
      });
      expect(messages).toEqual([
        { role: "system", content: "client-system" },
        { role: "user", content: "hi" },
      ]);
    });

    it("falls back to userText when messages is absent (and still includes system prompts)", () => {
      const messages = buildChatMessages({
        featureSystemPrompt: "feature-system",
        system: "client-system",
        userText: "hello",
      });
      expect(messages).toEqual([
        { role: "system", content: "feature-system" },
        { role: "system", content: "client-system" },
        { role: "user", content: "hello" },
      ]);
    });
  });

  describe("gate-token", () => {
    it("creates and verifies a valid token", () => {
      const secret = "test-secret";
      const now = Date.now();
      const payload = {
        v: 1 as const,
        exp: now + 60_000,
        n: "nonce",
        ip: "1.2.3.4",
        ua: hashUserAgent("ua"),
      };

      const token = createAiGateToken(secret, payload);
      const result = verifyAiGateToken(
        secret,
        token,
        { ip: "1.2.3.4", ua: payload.ua, nonce: "nonce" },
        now,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.payload.v).toBe(1);
        expect(result.payload.ip).toBe("1.2.3.4");
      }
    });

    it("rejects expired tokens", () => {
      const secret = "test-secret";
      const now = Date.now();
      const token = createAiGateToken(secret, {
        v: 1,
        exp: now - 1,
        n: "nonce",
        ip: "1.2.3.4",
        ua: hashUserAgent("ua"),
      });
      const result = verifyAiGateToken(
        secret,
        token,
        { ip: "1.2.3.4", ua: hashUserAgent("ua"), nonce: "nonce" },
        now,
      );
      expect(result.ok).toBe(false);
      expect(result).toMatchObject({ ok: false, reason: "expired" });
    });

    it("rejects tokens when bindings do not match", () => {
      const secret = "test-secret";
      const now = Date.now();
      const token = createAiGateToken(secret, {
        v: 1,
        exp: now + 60_000,
        n: "nonce",
        ip: "1.2.3.4",
        ua: hashUserAgent("ua"),
      });
      const result = verifyAiGateToken(
        secret,
        token,
        { ip: "9.9.9.9", ua: hashUserAgent("ua"), nonce: "nonce" },
        now,
      );
      expect(result.ok).toBe(false);
      expect(result).toMatchObject({ ok: false, reason: "mismatch" });
    });
  });

  describe("upstream-request-queue", () => {
    it("updates maxParallel when re-requested for the same key", async () => {
      vi.resetModules();
      const { getUpstreamRequestQueue } =
        await import("@/lib/ai/openai-compatible/upstream-request-queue");
      const first = getUpstreamRequestQueue({ key: "test-upstream", maxParallel: 1 });
      expect(first.snapshot.maxParallel).toBe(1);
      const increased = getUpstreamRequestQueue({ key: "test-upstream", maxParallel: 5 });
      expect(increased).toBe(first);
      expect(increased.snapshot.maxParallel).toBe(5);
      const decreased = getUpstreamRequestQueue({ key: "test-upstream", maxParallel: 2 });
      expect(decreased.snapshot.maxParallel).toBe(2);
    });

    it("rejects result when aborting a running task", async () => {
      const queue = new UpstreamRequestQueue({ key: "test-running-abort", maxParallel: 1 });
      const controller = new AbortController();
      let resolveRun: ((value: string) => void) | null = null;
      const runPromise = new Promise<string>((resolve) => {
        resolveRun = resolve;
      });
      const { started, result } = queue.enqueue({
        signal: controller.signal,
        run: () => runPromise,
      });
      await started;
      controller.abort();
      await expect(result).rejects.toMatchObject({ name: "AbortError" });
      resolveRun?.("ok");
    });
  });

  describe("feature-config", () => {
    const originalEnv = { ...process.env };
    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });
    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it("builds normalized OpenAI API base URL with /v1", () => {
      expect(buildOpenAiApiBaseUrl("https://example.com")).toBe("https://example.com/v1");
      expect(buildOpenAiApiBaseUrl("https://example.com/v1/")).toBe("https://example.com/v1");
    });

    it("builds chat completions URL with /v1 appended", () => {
      expect(buildChatCompletionsUrl("https://example.com")).toBe(
        "https://example.com/v1/chat/completions",
      );
    });

    it("builds responses URL with /v1 appended", () => {
      expect(buildResponsesUrl("https://example.com")).toBe("https://example.com/v1/responses");
      expect(buildResponsesUrl("https://example.com/v1/")).toBe("https://example.com/v1/responses");
    });

    it("resolves primary and fallback models from comma-separated model lists", () => {
      expect(resolvePreferredUpstreamModel("model-primary,model-fallback")).toEqual({
        primaryModel: "model-primary",
        fallbackModel: "model-fallback",
      });
      expect(resolvePreferredUpstreamModel("model-primary")).toEqual({
        primaryModel: "model-primary",
        fallbackModel: undefined,
      });
    });

    it("builds mode-specific queue keys using the primary model", () => {
      expect(
        buildUpstreamQueueKey({
          baseUrl: "https://example.com",
          model: "model-primary,model-fallback",
          apiMode: "chat_completions",
        }),
      ).toBe("https://example.com/v1/chat/completions::model-primary");
      expect(
        buildUpstreamQueueKey({
          baseUrl: "https://example.com",
          model: "model-primary,model-fallback",
          apiMode: "responses",
        }),
      ).toBe("https://example.com/v1/responses::model-primary");
    });

    it("builds chat completions URL when baseUrl already ends with /v1", () => {
      expect(buildChatCompletionsUrl("https://example.com/v1")).toBe(
        "https://example.com/v1/chat/completions",
      );
      expect(buildChatCompletionsUrl("https://example.com/v1/")).toBe(
        "https://example.com/v1/chat/completions",
      );
    });

    it("resolves feature-specific variables, then default, then built-in fallback", () => {
      process.env.AI_DEFAULT_OPENAI_BASE_URL = "https://default.example.com";
      process.env.AI_DEFAULT_LLM_MODEL = "default-model";
      process.env.AI_SEARCH_OPENAI_BASE_URL = "https://feature.example.com";
      process.env.AI_SEARCH_LLM_MODEL = "feature-model";
      process.env.AI_SEARCH_OPENAI_API_KEY = "feature-key";
      const feature = resolveOpenAiCompatibleFeatureConfig("search");
      expect(feature.baseUrl).toBe("https://feature.example.com");
      expect(feature.model).toBe("feature-model");
      expect(feature.apiKey).toBe("feature-key");
      const other = resolveOpenAiCompatibleFeatureConfig("other");
      expect(other.baseUrl).toBe("https://default.example.com");
      expect(other.model).toBe("default-model");
    });
  });
  describe("feature-defaults", () => {
    const minimalBody = { userText: "hi" } as ParsedRequestBody;

    it("returns global defaults when feature and request body have no overrides", () => {
      const params = resolveModelParams("unknown_feature", minimalBody);
      expect(params).toEqual({
        temperature: 1,
        topP: 1,
        reasoningEffort: "medium",
        maxTokens: 8192,
      });
    });

    it("applies feature defaults for terminal_chat", () => {
      const params = resolveModelParams("terminal_chat", minimalBody);
      expect(params.temperature).toBe(0.7);
      expect(params.reasoningEffort).toBe("low");
      expect(params.topP).toBe(1);
      expect(params.maxTokens).toBe(8192);
    });

    it("applies lower-entropy defaults for structured analysis features", () => {
      const bookmark = resolveModelParams("bookmark-analysis", minimalBody);
      const book = resolveModelParams("book-analysis", minimalBody);
      const project = resolveModelParams("project-analysis", minimalBody);

      expect(bookmark.temperature).toBe(0.2);
      expect(bookmark.reasoningEffort).toBe("low");
      expect(book.temperature).toBe(0.2);
      expect(book.reasoningEffort).toBe("low");
      expect(project.temperature).toBe(0.2);
      expect(project.reasoningEffort).toBe("low");
    });

    it("consumer request body overrides feature defaults", () => {
      const body = {
        userText: "hi",
        temperature: 0.5,
        top_p: 0.9,
        reasoning_effort: "high",
      } as ParsedRequestBody;
      const params = resolveModelParams("terminal_chat", body);
      expect(params.temperature).toBe(0.5);
      expect(params.topP).toBe(0.9);
      expect(params.reasoningEffort).toBe("high");
    });

    it("resolveFeatureSystemPrompt returns undefined for unknown features without augment", () => {
      expect(resolveFeatureSystemPrompt("unknown", undefined)).toBeUndefined();
    });

    it("resolveFeatureSystemPrompt concatenates feature prompt with augmented prompt", () => {
      const result = resolveFeatureSystemPrompt("terminal_chat", "extra context");
      expect(result).toContain("terminal interface");
      expect(result).toContain("extra context");
    });
  });

  describe("isHarmonyFormatModel", () => {
    it("identifies GPT-OSS models as Harmony format (json_schema incompatible)", () => {
      expect(isHarmonyFormatModel("openai/gpt-oss-120b")).toBe(true);
      expect(isHarmonyFormatModel("openai/gpt-oss-20b")).toBe(true);
      expect(isHarmonyFormatModel("GPT-OSS-120B")).toBe(true);
      expect(isHarmonyFormatModel("qwen3-30b-2507")).toBe(false);
      expect(isHarmonyFormatModel("gpt-4o-2024-08-06")).toBe(false);
    });
  });

  describe("analysis response-format constraints", () => {
    it("enforces non-empty strings and bounded arrays for bookmark analysis", () => {
      const schema = BOOKMARK_ANALYSIS_RESPONSE_FORMAT.json_schema.schema;
      const props = schema.properties;
      expect(props.summary).toEqual(expect.objectContaining({ minLength: 1 }));
      expect(props.category).toEqual(expect.objectContaining({ minLength: 1 }));
      expect(props.targetAudience).toEqual(expect.objectContaining({ minLength: 1 }));
      expect(props.highlights).toEqual(expect.objectContaining({ minItems: 1, maxItems: 6 }));
      expect(props.highlights.items).toEqual(expect.objectContaining({ minLength: 1 }));
      expect(props.relatedResources).toEqual(expect.objectContaining({ minItems: 1, maxItems: 6 }));
      expect(props.relatedResources.items).toEqual(expect.objectContaining({ minLength: 1 }));
    });

    it("enforces non-empty strings and bounded arrays for book analysis", () => {
      const schema = BOOK_ANALYSIS_RESPONSE_FORMAT.json_schema.schema;
      const props = schema.properties;
      expect(props.summary).toEqual(expect.objectContaining({ minLength: 1 }));
      expect(props.category).toEqual(expect.objectContaining({ minLength: 1 }));
      expect(props.idealReader).toEqual(expect.objectContaining({ minLength: 1 }));
      expect(props.whyItMatters).toEqual(expect.objectContaining({ minLength: 1 }));
      expect(props.keyThemes).toEqual(expect.objectContaining({ minItems: 1, maxItems: 6 }));
      expect(props.keyThemes.items).toEqual(expect.objectContaining({ minLength: 1 }));
      expect(props.relatedReading).toEqual(expect.objectContaining({ minItems: 1, maxItems: 6 }));
      expect(props.relatedReading.items).toEqual(expect.objectContaining({ minLength: 1 }));
    });

    it("enforces non-empty strings and bounded arrays for project analysis", () => {
      const schema = PROJECT_ANALYSIS_RESPONSE_FORMAT.json_schema.schema;
      const props = schema.properties;
      expect(props.summary).toEqual(expect.objectContaining({ minLength: 1 }));
      expect(props.category).toEqual(expect.objectContaining({ minLength: 1 }));
      expect(props.targetUsers).toEqual(expect.objectContaining({ minLength: 1 }));
      expect(props.uniqueValue).toEqual(expect.objectContaining({ minLength: 1 }));
      expect(props.keyFeatures).toEqual(expect.objectContaining({ minItems: 1, maxItems: 6 }));
      expect(props.keyFeatures.items).toEqual(expect.objectContaining({ minLength: 1 }));
      expect(props.relatedProjects).toEqual(expect.objectContaining({ minItems: 1, maxItems: 6 }));
      expect(props.relatedProjects.items).toEqual(expect.objectContaining({ minLength: 1 }));
    });
  });

  describe("openai-compatible-client adapter", () => {
    it("maps max_tokens to max_completion_tokens and passes top_p and reasoning_effort", async () => {
      vi.resetModules();
      const mockCreate = vi.fn().mockResolvedValue({
        id: "chatcmpl_2",
        choices: [{ message: { role: "assistant", content: "ok" } }],
      });
      class MockOpenAI {
        public chat = { completions: { create: mockCreate, stream: vi.fn() } };
        public responses = { create: vi.fn(), stream: vi.fn() };
      }
      vi.doMock("openai", () => ({ __esModule: true, default: MockOpenAI, OpenAI: MockOpenAI }));
      const { callOpenAiCompatibleChatCompletions } =
        await import("@/lib/ai/openai-compatible/openai-compatible-client");
      await callOpenAiCompatibleChatCompletions({
        baseUrl: "https://example.com",
        apiKey: "test-key",
        request: {
          model: "test-model",
          messages: [{ role: "user", content: "hi" }],
          temperature: 1,
          top_p: 0.9,
          max_tokens: 8192,
          reasoning_effort: "medium",
        },
      });
      const payload = mockCreate.mock.calls[0]?.[0];
      expect(payload.max_completion_tokens).toBe(8192);
      expect(payload.max_tokens).toBeUndefined();
      expect(payload.top_p).toBe(0.9);
      expect(payload.reasoning_effort).toBe("medium");
      expect(payload.temperature).toBe(1);
    });

    it("omits undefined optional fields from chat request", async () => {
      vi.resetModules();
      const mockCreate = vi.fn().mockResolvedValue({
        id: "chatcmpl_3",
        choices: [{ message: { role: "assistant", content: "ok" } }],
      });
      class MockOpenAI {
        public chat = { completions: { create: mockCreate, stream: vi.fn() } };
        public responses = { create: vi.fn(), stream: vi.fn() };
      }
      vi.doMock("openai", () => ({ __esModule: true, default: MockOpenAI, OpenAI: MockOpenAI }));
      const { callOpenAiCompatibleChatCompletions } =
        await import("@/lib/ai/openai-compatible/openai-compatible-client");
      await callOpenAiCompatibleChatCompletions({
        baseUrl: "https://example.com",
        apiKey: "test-key",
        request: { model: "test-model", messages: [{ role: "user", content: "hi" }] },
      });
      const payload = mockCreate.mock.calls[0]?.[0];
      expect(payload).not.toHaveProperty("temperature");
      expect(payload).not.toHaveProperty("top_p");
      expect(payload).not.toHaveProperty("max_completion_tokens");
      expect(payload).not.toHaveProperty("max_tokens");
      expect(payload).not.toHaveProperty("reasoning_effort");
    });

    it("accepts refusal-only assistant responses from chat completions", async () => {
      vi.resetModules();
      const mockCreate = vi.fn().mockResolvedValue({
        id: "chatcmpl_refusal",
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              refusal: "I cannot help with that request.",
            },
            finish_reason: "content_filter",
          },
        ],
      });
      class MockOpenAI {
        public chat = { completions: { create: mockCreate, stream: vi.fn() } };
        public responses = { create: vi.fn(), stream: vi.fn() };
      }
      vi.doMock("openai", () => ({ __esModule: true, default: MockOpenAI, OpenAI: MockOpenAI }));
      const { callOpenAiCompatibleChatCompletions } =
        await import("@/lib/ai/openai-compatible/openai-compatible-client");

      const response = await callOpenAiCompatibleChatCompletions({
        baseUrl: "https://example.com",
        apiKey: "test-key",
        request: {
          model: "test-model",
          messages: [{ role: "user", content: "hello" }],
        },
      });

      expect(response.choices[0]?.message.content).toBeNull();
      expect(response.choices[0]?.message.refusal).toBe("I cannot help with that request.");
    });

    it("maps assistant tool calls and tool outputs to Responses API input items", async () => {
      vi.resetModules();
      const mockResponsesCreate = vi.fn().mockResolvedValue({
        id: "response_1",
        output_text: "ok",
        output: [],
      });
      class MockOpenAI {
        public chat = { completions: { create: vi.fn(), stream: vi.fn() } };
        public responses = { create: mockResponsesCreate, stream: vi.fn() };
      }
      vi.doMock("openai", () => ({
        __esModule: true,
        default: MockOpenAI,
        OpenAI: MockOpenAI,
      }));
      const { callOpenAiCompatibleResponses } =
        await import("@/lib/ai/openai-compatible/openai-compatible-client");
      await callOpenAiCompatibleResponses({
        baseUrl: "https://example.com",
        apiKey: "test-key",
        request: {
          model: "test-model",
          input: [
            { role: "user", content: "find wikipedia" },
            {
              role: "assistant",
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "search_bookmarks", arguments: '{"query":"wikipedia"}' },
                },
              ],
            },
            { role: "tool", tool_call_id: "call_1", content: '{"results":[]}' },
          ],
        },
      });
      const payload = mockResponsesCreate.mock.calls[0]?.[0];
      expect(payload.input).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "function_call", call_id: "call_1" }),
          expect.objectContaining({ type: "function_call_output", call_id: "call_1" }),
        ]),
      );
    });

    it("derives responses output_text from refusal output when text output is absent", async () => {
      vi.resetModules();
      const mockResponsesCreate = vi.fn().mockResolvedValue({
        id: "response_refusal",
        output: [
          {
            type: "message",
            content: [{ type: "refusal", refusal: "I cannot help with that request." }],
          },
        ],
      });
      class MockOpenAI {
        public chat = { completions: { create: vi.fn(), stream: vi.fn() } };
        public responses = { create: mockResponsesCreate, stream: vi.fn() };
      }
      vi.doMock("openai", () => ({
        __esModule: true,
        default: MockOpenAI,
        OpenAI: MockOpenAI,
      }));
      const { callOpenAiCompatibleResponses } =
        await import("@/lib/ai/openai-compatible/openai-compatible-client");

      const response = await callOpenAiCompatibleResponses({
        baseUrl: "https://example.com",
        apiKey: "test-key",
        request: {
          model: "test-model",
          input: [{ role: "user", content: "hello" }],
        },
      });

      expect(response.output_text).toBe("I cannot help with that request.");
    });

    it("forwards streaming chat callbacks and returns the final completion", async () => {
      vi.resetModules();
      const finalChatCompletion = vi.fn().mockResolvedValue({
        id: "chatcmpl_1",
        choices: [{ message: { role: "assistant", content: "ok" } }],
      });
      const mockChatStream = vi.fn().mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield { id: "chatcmpl_1", model: "test-model", choices: [{ delta: { content: "o" } }] };
          yield { id: "chatcmpl_1", model: "test-model", choices: [{ delta: { content: "k" } }] };
        },
        finalChatCompletion,
      });
      class MockOpenAI {
        public chat = { completions: { create: vi.fn(), stream: mockChatStream } };
        public responses = { create: vi.fn(), stream: vi.fn() };
      }
      vi.doMock("openai", () => ({
        __esModule: true,
        default: MockOpenAI,
        OpenAI: MockOpenAI,
      }));
      const { streamOpenAiCompatibleChatCompletions } =
        await import("@/lib/ai/openai-compatible/openai-compatible-client");
      const onStart = vi.fn();
      const onDelta = vi.fn();
      const response = await streamOpenAiCompatibleChatCompletions({
        baseUrl: "https://example.net",
        apiKey: "test-key",
        request: {
          model: "test-model",
          messages: [{ role: "user", content: "hello" }],
        },
        onStart,
        onDelta,
      });
      expect(onStart).toHaveBeenCalledWith({ id: "chatcmpl_1", model: "test-model" });
      expect(onDelta.mock.calls.map(([delta]) => delta)).toEqual(["o", "k"]);
      expect(response.choices[0]?.message.content).toBe("ok");
    });
  });

  function createSseResponse(chunks: string[]): Response {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
    });
  }

  describe("browser-client SSE handling", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("returns message_done payload when stream closes without done event", async () => {
      vi.resetModules();
      const fetchMock = vi.fn<typeof fetch>();
      fetchMock
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              token: "test-token",
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
        .mockResolvedValueOnce(
          createSseResponse([
            'event: message_start\r\ndata: {"id":"chatcmpl_refusal","model":"test-model","apiMode":"chat_completions"}\r\n\r\n',
            'event: message_done\r\ndata: {"message":"I cannot help with that request."}\r\n',
          ]),
        );
      vi.stubGlobal("fetch", fetchMock);

      const { aiChat } = await import("@/lib/ai/openai-compatible/browser-client");
      const onStreamEvent = vi.fn();

      const message = await aiChat(
        "terminal_chat",
        { userText: "hello" },
        {
          onStreamEvent,
        },
      );

      expect(message).toBe("I cannot help with that request.");
      expect(onStreamEvent.mock.calls.map(([event]) => event)).toEqual([
        {
          event: "message_start",
          data: { id: "chatcmpl_refusal", model: "test-model", apiMode: "chat_completions" },
        },
        {
          event: "message_done",
          data: { message: "I cannot help with that request." },
        },
      ]);
    });

    it("accepts done payload metadata when message_done is missing", async () => {
      vi.resetModules();
      const fetchMock = vi.fn<typeof fetch>();
      fetchMock
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              token: "test-token",
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
        .mockResolvedValueOnce(
          createSseResponse([
            'event: done\r\ndata: {"message":"Final response","ragContext":"included"}\r\n\r\n',
          ]),
        );
      vi.stubGlobal("fetch", fetchMock);

      const { aiChat } = await import("@/lib/ai/openai-compatible/browser-client");
      const message = await aiChat("terminal_chat", { userText: "hello" });

      expect(message).toBe("Final response");
    });

    it("rejects a 200 chat response that is JSON instead of SSE", async () => {
      vi.resetModules();
      const fetchMock = vi.fn<typeof fetch>();
      fetchMock
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              token: "test-token",
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ message: "json payload" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      vi.stubGlobal("fetch", fetchMock);

      const { aiChat } = await import("@/lib/ai/openai-compatible/browser-client");

      await expect(aiChat("terminal_chat", { userText: "hello" })).rejects.toThrow(
        "AI chat expected text/event-stream",
      );

      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "/api/ai/chat/terminal_chat",
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: "text/event-stream",
          }),
        }),
      );
    });
  });

  describe("analysis-client-utils JSON parsing", () => {
    it("parses fenced JSON with explanatory text around it", () => {
      const parsed = parseLlmJson(
        `Here is the analysis:\n\n\`\`\`json\n{"summary":"ok","items":[1,2,3]}\n\`\`\`\n\nDone.`,
      );
      expect(parsed).toEqual({ summary: "ok", items: [1, 2, 3] });
    });

    it("parses control-token-wrapped JSON payloads", () => {
      const parsed = parseLlmJson(
        `<|channel|>final <|message|>{"summary":"ok","nested":{"status":"ready"}}`,
      );
      expect(parsed).toEqual({ summary: "ok", nested: { status: "ready" } });
    });

    it("repairs recoverable JSON errors before parsing", () => {
      const parsed = parseLlmJson(`{summary: "ok", highlights: ["one",],}`);
      expect(parsed).toEqual({ summary: "ok", highlights: ["one"] });
    });
  });

  describe("ai-token route", () => {
    const originalEnv = { ...process.env };
    beforeEach(() => {
      process.env = { ...originalEnv, AI_TOKEN_SIGNING_SECRET: "test-secret" };
    });
    afterEach(() => {
      process.env = { ...originalEnv };
    });
    it("prefers cf-visitor https over x-forwarded-proto when setting cookies", () => {
      const request = Object.assign(
        new NextRequest("https://williamcallahan.com/api/ai/token", {
          headers: {
            origin: "https://williamcallahan.com",
            "x-forwarded-proto": "http",
            "cf-visitor": JSON.stringify({ scheme: "https" }),
          },
        }),
        { nextUrl: new URL("https://williamcallahan.com/api/ai/token") },
      );
      const response = getAiToken(request);
      const setCookie = response.headers.get("set-cookie") ?? "";
      expect(response.status).toBe(200);
      expect(setCookie).toContain("__Host-ai_gate_nonce=");
      expect(setCookie).toContain("Secure");
    });
  });
});
