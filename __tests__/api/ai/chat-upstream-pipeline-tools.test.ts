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

describe("AI Chat Upstream Pipeline Tools", () => {
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
  });

  it("executes bookmark tool calls for explicit search requests", async () => {
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

    mockCallOpenAiCompatibleChatCompletions
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: "assistant",
              tool_calls: [
                {
                  id: "tool-call-1",
                  type: "function",
                  function: {
                    name: "search_bookmarks",
                    arguments: JSON.stringify({
                      query: "wikipedia ai writing",
                      maxResults: 5,
                    }),
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { role: "assistant", content: "" } }],
      });

    const pipeline = buildChatPipeline(
      "terminal_chat",
      createValidatedContext({ userContent: "search bookmarks for wikipedia" }),
      { augmentedPrompt: undefined, status: "not_applicable" },
      new AbortController().signal,
    );

    const reply = await pipeline.runUpstream();

    expect(mockCallOpenAiCompatibleChatCompletions).toHaveBeenCalledTimes(2);
    const firstCallRequest = mockCallOpenAiCompatibleChatCompletions.mock.calls[0]?.[0]?.request;
    expect(firstCallRequest?.tool_choice).toBe("required");
    expect(firstCallRequest?.tools?.[0]?.function?.name).toBe("search_bookmarks");
    expect(mockedSearchBookmarks).toHaveBeenCalledWith("wikipedia ai writing");
    expect(reply).toContain("Here are the best matches I found:");
    expect(reply).toContain(
      "[Signs of AI writing / LLM written text (Wikipedia article)](/bookmarks/en-wikipedia-org-wiki-wikipedia-signs-of-ai-writing)",
    );
  });

  it("accepts assistant tool-call responses where content is null", async () => {
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

    mockCallOpenAiCompatibleChatCompletions
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "tool-call-1",
                  type: "function",
                  function: {
                    name: "search_bookmarks",
                    arguments: JSON.stringify({
                      query: "wikipedia ai writing",
                    }),
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { role: "assistant", content: "" } }],
      });

    const pipeline = buildChatPipeline(
      "terminal_chat",
      createValidatedContext({ userContent: "search bookmarks for wikipedia" }),
      { augmentedPrompt: undefined, status: "not_applicable" },
      new AbortController().signal,
    );

    const reply = await pipeline.runUpstream();

    expect(mockCallOpenAiCompatibleChatCompletions).toHaveBeenCalledTimes(2);
    expect(mockedSearchBookmarks).toHaveBeenCalledWith("wikipedia ai writing");
    expect(reply).toContain(
      "[Signs of AI writing / LLM written text (Wikipedia article)](/bookmarks/en-wikipedia-org-wiki-wikipedia-signs-of-ai-writing)",
    );
  });

  it("falls back to deterministic bookmark search when model skips tool calls", async () => {
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

    mockCallOpenAiCompatibleChatCompletions.mockResolvedValueOnce({
      choices: [
        {
          message: {
            role: "assistant",
            content: "I can search that for you.",
          },
        },
      ],
    });

    const pipeline = buildChatPipeline(
      "terminal_chat",
      createValidatedContext({ userContent: "search bookmarks for wikipedia" }),
      { augmentedPrompt: undefined, status: "not_applicable" },
      new AbortController().signal,
    );

    const reply = await pipeline.runUpstream();

    expect(mockCallOpenAiCompatibleChatCompletions).toHaveBeenCalledTimes(1);
    expect(mockedSearchBookmarks).toHaveBeenCalledWith("search bookmarks for wikipedia");
    expect(reply).toContain(
      "[Signs of AI writing / LLM written text (Wikipedia article)](/bookmarks/en-wikipedia-org-wiki-wikipedia-signs-of-ai-writing)",
    );
  });

  it("returns refusal text when chat completions omits assistant content", async () => {
    mockCallOpenAiCompatibleChatCompletions.mockResolvedValueOnce({
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

    const pipeline = buildChatPipeline(
      "terminal_chat",
      createValidatedContext({ userContent: "hello there" }),
      { augmentedPrompt: undefined, status: "not_applicable" },
      new AbortController().signal,
    );

    const reply = await pipeline.runUpstream();

    expect(mockCallOpenAiCompatibleChatCompletions).toHaveBeenCalledTimes(1);
    expect(reply).toBe("I cannot help with that request.");
  });

  it("supports responses mode tool calls when arguments are object-shaped", async () => {
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

    mockCallOpenAiCompatibleResponses
      .mockResolvedValueOnce({
        id: "response_1",
        output_text: "",
        output: [
          {
            type: "function_call",
            call_id: "tool-call-1",
            name: "search_bookmarks",
            arguments: {
              query: "wikipedia ai writing",
              maxResults: 5,
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        id: "response_2",
        output_text: "",
        output: [],
      });

    const pipeline = buildChatPipeline(
      "terminal_chat",
      createValidatedContext({
        userContent: "search bookmarks for wikipedia",
        apiMode: "responses",
      }),
      { augmentedPrompt: undefined, status: "not_applicable" },
      new AbortController().signal,
    );

    const reply = await pipeline.runUpstream();

    expect(mockGetUpstreamRequestQueue).toHaveBeenCalledWith({
      key: "https://example.com/v1/responses::test-model",
      maxParallel: 1,
    });
    expect(mockCallOpenAiCompatibleResponses).toHaveBeenCalledTimes(2);
    expect(mockCallOpenAiCompatibleChatCompletions).not.toHaveBeenCalled();
    expect(mockCallOpenAiCompatibleResponses).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://example.com",
      }),
    );
    const firstCallRequest = mockCallOpenAiCompatibleResponses.mock.calls[0]?.[0]?.request;
    expect(firstCallRequest?.tool_choice).toBe("required");
    expect(firstCallRequest?.tools?.[0]?.name).toBe("search_bookmarks");
    expect(mockedSearchBookmarks).toHaveBeenCalledWith("wikipedia ai writing");
    expect(reply).toContain(
      "[Signs of AI writing / LLM written text (Wikipedia article)](/bookmarks/en-wikipedia-org-wiki-wikipedia-signs-of-ai-writing)",
    );
  });
});
