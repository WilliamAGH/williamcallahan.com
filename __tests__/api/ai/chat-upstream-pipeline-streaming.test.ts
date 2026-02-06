import { buildChatPipeline } from "@/app/api/ai/chat/[feature]/upstream-pipeline";
import { searchBookmarks } from "@/lib/search/searchers/dynamic-searchers";
import type { ValidatedRequestContext } from "@/types/features/ai-chat";
import type { OpenAiCompatibleChatMessage } from "@/types/schemas/ai-openai-compatible";

const mockCallOpenAiCompatibleChatCompletions = vi.fn().mockResolvedValue({
  choices: [{ message: { content: "ok" } }],
});
const mockCallOpenAiCompatibleResponses = vi.fn().mockResolvedValue({
  id: "response_1",
  output_text: "ok",
  output: [],
});
const mockStreamOpenAiCompatibleChatCompletions = vi.fn();
const mockStreamOpenAiCompatibleResponses = vi.fn();
const mockBuildChatMessages = vi
  .fn()
  .mockReturnValue([
    { role: "user", content: "search bookmarks" } satisfies OpenAiCompatibleChatMessage,
  ]);
const mockGetUpstreamRequestQueue = vi.fn().mockReturnValue({
  add: vi.fn(),
});

vi.mock("@/lib/ai/openai-compatible/openai-compatible-client", () => ({
  callOpenAiCompatibleChatCompletions: (...args: unknown[]) =>
    mockCallOpenAiCompatibleChatCompletions(...args),
  callOpenAiCompatibleResponses: (...args: unknown[]) => mockCallOpenAiCompatibleResponses(...args),
  streamOpenAiCompatibleChatCompletions: (...args: unknown[]) =>
    mockStreamOpenAiCompatibleChatCompletions(...args),
  streamOpenAiCompatibleResponses: (...args: unknown[]) =>
    mockStreamOpenAiCompatibleResponses(...args),
}));

vi.mock("@/lib/ai/openai-compatible/chat-messages", () => ({
  buildChatMessages: (...args: unknown[]) => mockBuildChatMessages(...args),
}));

vi.mock("@/lib/ai/openai-compatible/upstream-request-queue", () => ({
  getUpstreamRequestQueue: (...args: unknown[]) => mockGetUpstreamRequestQueue(...args),
}));

vi.mock("@/lib/ai/openai-compatible/feature-config", () => ({
  resolveOpenAiCompatibleFeatureConfig: vi.fn().mockReturnValue({
    baseUrl: "https://example.com",
    model: "test-model",
    maxParallel: 1,
  }),
  buildChatCompletionsUrl: vi.fn().mockReturnValue("https://example.com/v1/chat/completions"),
  buildResponsesUrl: vi.fn().mockReturnValue("https://example.com/v1/responses"),
}));

vi.mock("@/lib/search/searchers/dynamic-searchers", () => ({
  searchBookmarks: vi.fn(),
}));

const mockedSearchBookmarks = vi.mocked(searchBookmarks);
const conversationId = "77777777-7777-4777-8777-777777777777";

function createValidatedContext(args?: {
  temperature?: number;
  userContent?: string;
  apiMode?: "chat_completions" | "responses";
}): ValidatedRequestContext {
  return {
    feature: "terminal_chat",
    clientIp: "::1",
    pagePath: "/bookmarks",
    originHost: "localhost",
    userAgent: "vitest",
    parsedBody: {
      conversationId,
      priority: 10,
      ...(args?.temperature !== undefined ? { temperature: args.temperature } : {}),
      ...(args?.apiMode ? { apiMode: args.apiMode } : {}),
      messages: [{ role: "user", content: args?.userContent ?? "hello there" }],
    },
  };
}

describe("AI Chat Upstream Pipeline Streaming", () => {
  beforeEach(() => {
    mockedSearchBookmarks.mockReset();
    mockCallOpenAiCompatibleChatCompletions.mockClear();
    mockCallOpenAiCompatibleResponses.mockClear();
    mockStreamOpenAiCompatibleChatCompletions.mockClear();
    mockStreamOpenAiCompatibleResponses.mockClear();
    mockBuildChatMessages.mockClear();
    mockGetUpstreamRequestQueue.mockClear();
    mockCallOpenAiCompatibleChatCompletions.mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "ok" } }],
    });
    mockCallOpenAiCompatibleResponses.mockResolvedValue({
      id: "response_1",
      output_text: "ok",
      output: [],
    });
    mockStreamOpenAiCompatibleChatCompletions.mockImplementation(
      ({
        onStart,
        onDelta,
      }: {
        onStart?: (meta: { id: string; model: string }) => void;
        onDelta?: (delta: string) => void;
      }) => {
        onStart?.({ id: "chatcmpl_1", model: "test-model" });
        onDelta?.("o");
        onDelta?.("k");
        return Promise.resolve({
          id: "chatcmpl_1",
          choices: [{ message: { role: "assistant", content: "ok" } }],
        });
      },
    );
    mockStreamOpenAiCompatibleResponses.mockImplementation(
      ({
        onStart,
        onDelta,
      }: {
        onStart?: (meta: { id: string; model: string }) => void;
        onDelta?: (delta: string) => void;
      }) => {
        onStart?.({ id: "response_1", model: "test-model" });
        onDelta?.("o");
        onDelta?.("k");
        return Promise.resolve({
          id: "response_1",
          output_text: "ok",
          output: [],
        });
      },
    );
  });

  it("defaults terminal chat to feature-specific model params when not provided", async () => {
    const pipeline = buildChatPipeline(
      "terminal_chat",
      createValidatedContext(),
      { augmentedPrompt: undefined, status: "not_applicable" },
      new AbortController().signal,
    );

    await pipeline.runUpstream();

    expect(mockGetUpstreamRequestQueue).toHaveBeenCalledWith({
      key: "https://example.com/v1/chat/completions::test-model",
      maxParallel: 1,
    });
    expect(mockCallOpenAiCompatibleChatCompletions).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://example.com",
        request: expect.objectContaining({
          model: "test-model",
          temperature: 0.7,
          top_p: 1,
          max_tokens: 8192,
          reasoning_effort: "low",
        }),
      }),
    );
    expect(mockCallOpenAiCompatibleResponses).not.toHaveBeenCalled();
  });

  it("respects explicit client temperature when provided", async () => {
    const pipeline = buildChatPipeline(
      "terminal_chat",
      createValidatedContext({ temperature: 0.75 }),
      { augmentedPrompt: undefined, status: "not_applicable" },
      new AbortController().signal,
    );

    await pipeline.runUpstream();

    expect(mockCallOpenAiCompatibleChatCompletions).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          temperature: 0.75,
        }),
      }),
    );
  });

  it("emits normalized stream events when runUpstream receives an event callback", async () => {
    const pipeline = buildChatPipeline(
      "terminal_chat",
      createValidatedContext(),
      { augmentedPrompt: undefined, status: "not_applicable" },
      new AbortController().signal,
    );

    const events: Array<{ event: string; data: unknown }> = [];
    const reply = await pipeline.runUpstream((event) => {
      events.push(event);
    });

    expect(reply).toBe("ok");
    expect(mockStreamOpenAiCompatibleChatCompletions).toHaveBeenCalledTimes(1);
    expect(mockCallOpenAiCompatibleChatCompletions).not.toHaveBeenCalled();
    expect(events).toEqual([
      {
        event: "message_start",
        data: { id: "chatcmpl_1", model: "test-model", apiMode: "chat_completions" },
      },
      { event: "message_delta", data: { delta: "ok" } },
      { event: "message_done", data: { message: "ok" } },
    ]);
  });

  it("streams responses mode events when runUpstream receives an event callback", async () => {
    const pipeline = buildChatPipeline(
      "terminal_chat",
      createValidatedContext({ apiMode: "responses" }),
      { augmentedPrompt: undefined, status: "not_applicable" },
      new AbortController().signal,
    );

    const events: Array<{ event: string; data: unknown }> = [];
    const reply = await pipeline.runUpstream((event) => {
      events.push(event);
    });

    expect(reply).toBe("ok");
    expect(mockStreamOpenAiCompatibleResponses).toHaveBeenCalledTimes(1);
    expect(mockCallOpenAiCompatibleResponses).not.toHaveBeenCalled();
    expect(mockCallOpenAiCompatibleChatCompletions).not.toHaveBeenCalled();
    expect(events).toEqual([
      {
        event: "message_start",
        data: { id: "response_1", model: "test-model", apiMode: "responses" },
      },
      { event: "message_delta", data: { delta: "ok" } },
      { event: "message_done", data: { message: "ok" } },
    ]);
  });

  it("does not emit interim stream text from turns that end in tool calls", async () => {
    mockedSearchBookmarks.mockResolvedValue([
      {
        id: "bookmark-1",
        type: "bookmark",
        title: "Signs of AI writing / LLM written text (Wikipedia article)",
        description: "Wikipedia article bookmark",
        url: "/bookmarks/en-wikipedia-org-wiki-wikipedia-signs-of-ai-writing",
        score: 99,
      },
    ]);

    mockStreamOpenAiCompatibleChatCompletions
      .mockImplementationOnce(
        ({
          onStart,
          onDelta,
        }: {
          onStart?: (meta: { id: string; model: string }) => void;
          onDelta?: (delta: string) => void;
        }) => {
          onStart?.({ id: "chatcmpl_tool", model: "test-model" });
          onDelta?.("interim");
          return Promise.resolve({
            id: "chatcmpl_tool",
            choices: [
              {
                message: {
                  role: "assistant",
                  tool_calls: [
                    {
                      id: "tool-call-1",
                      type: "function",
                      function: { name: "search_bookmarks", arguments: '{"query":"wikipedia"}' },
                    },
                  ],
                },
              },
            ],
          });
        },
      )
      .mockImplementationOnce(
        ({
          onStart,
          onDelta,
        }: {
          onStart?: (meta: { id: string; model: string }) => void;
          onDelta?: (delta: string) => void;
        }) => {
          onStart?.({ id: "chatcmpl_final", model: "test-model" });
          onDelta?.("final");
          return Promise.resolve({
            id: "chatcmpl_final",
            choices: [{ message: { role: "assistant", content: "final" } }],
          });
        },
      );

    const pipeline = buildChatPipeline(
      "terminal_chat",
      createValidatedContext({ userContent: "search bookmarks for wikipedia" }),
      { augmentedPrompt: undefined, status: "not_applicable" },
      new AbortController().signal,
    );
    const events: Array<{ event: string; data: unknown }> = [];
    const reply = await pipeline.runUpstream((event) => events.push(event));

    expect(reply).toBe("final");
    expect(events).toEqual([
      {
        event: "message_start",
        data: { id: "chatcmpl_final", model: "test-model", apiMode: "chat_completions" },
      },
      { event: "message_delta", data: { delta: "final" } },
      { event: "message_done", data: { message: "final" } },
    ]);
  });
});
