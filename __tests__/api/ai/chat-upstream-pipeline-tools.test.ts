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
  resolvePreferredUpstreamModel: vi.fn().mockReturnValue({
    primaryModel: "test-model",
    fallbackModel: undefined,
  }),
  buildUpstreamQueueKey: vi.fn(({ baseUrl, model, apiMode }) => {
    const route = apiMode === "responses" ? "responses" : "chat/completions";
    return `${baseUrl}/v1/${route}::${model}`;
  }),
}));

vi.mock("@/lib/search/searchers/dynamic-searchers", () => ({
  searchBookmarks: vi.fn(),
}));

const mockedSearchBookmarks = vi.mocked(searchBookmarks);
const conversationId = "77777777-7777-4777-8777-777777777777";
const bookmarkTitle = "Signs of AI writing / LLM written text (Wikipedia article)";
const bookmarkUrl = "/bookmarks/en-wikipedia-org-wiki-wikipedia-signs-of-ai-writing";
const bookmarkLink = `[${bookmarkTitle}](${bookmarkUrl})`;
const searchQuery = "wikipedia ai writing";
const explicitSearchPrompt = "search bookmarks for wikipedia";
const bookmarkResult = {
  id: "bookmark-1",
  type: "bookmark" as const,
  title: bookmarkTitle,
  description: "Wikipedia article bookmark",
  url: bookmarkUrl,
  score: 99,
};

function mockSingleBookmarkSearchResult(): void {
  mockedSearchBookmarks.mockResolvedValue([bookmarkResult]);
}

function buildSearchBookmarksToolCall(params?: {
  query?: string;
  maxResults?: number;
  callId?: string;
}): {
  id: string;
  type: "function";
  function: { name: "search_bookmarks"; arguments: string };
} {
  const query = params?.query ?? searchQuery;
  const callId = params?.callId ?? "tool-call-1";
  const argumentsPayload =
    typeof params?.maxResults === "number" ? { query, maxResults: params.maxResults } : { query };

  return {
    id: callId,
    type: "function",
    function: {
      name: "search_bookmarks",
      arguments: JSON.stringify(argumentsPayload),
    },
  };
}

function mockChatToolCallThenContent(params: {
  finalContent: string;
  initialContent?: string | null;
  query?: string;
  maxResults?: number;
}): void {
  const firstMessageBase = {
    role: "assistant",
    tool_calls: [buildSearchBookmarksToolCall(params)],
  };
  const firstMessage =
    params.initialContent === undefined
      ? firstMessageBase
      : { ...firstMessageBase, content: params.initialContent };

  mockCallOpenAiCompatibleChatCompletions
    .mockResolvedValueOnce({
      choices: [
        {
          message: firstMessage,
        },
      ],
    })
    .mockResolvedValueOnce({
      choices: [
        {
          message: {
            role: "assistant",
            content: params.finalContent,
          },
        },
      ],
    });
}

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

function createPipeline(args?: {
  temperature?: number;
  userContent?: string;
  apiMode?: "chat_completions" | "responses";
}) {
  return buildChatPipeline({
    feature: "terminal_chat",
    ctx: createValidatedContext(args),
    ragResult: { augmentedPrompt: undefined, status: "not_applicable" },
    signal: new AbortController().signal,
  });
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

  it.each([
    {
      label: "executes bookmark tool calls for explicit search requests",
      toolChoice: "required" as const,
      userContent: explicitSearchPrompt,
      mutatedToken: "en-wikipedia-org-wiki-wikipedia-signs-of-ai-writing-typo",
    },
    {
      label: "returns deterministic links when auto tool mode mutates a URL",
      toolChoice: "auto" as const,
      userContent: "hello there",
      mutatedToken: "en-wikipedia-org-wiki-wikipedia-signs-of-ai-writing-mutated",
    },
  ])("$label", async ({ toolChoice, userContent, mutatedToken }) => {
    mockSingleBookmarkSearchResult();
    mockChatToolCallThenContent({
      finalContent: `Here are links:\n- [Wrong Link](/bookmarks/${mutatedToken})`,
      maxResults: 5,
    });

    const pipeline = createPipeline({ userContent });
    const reply = await pipeline.runUpstream();

    expect(mockCallOpenAiCompatibleChatCompletions).toHaveBeenCalledTimes(2);
    const firstCallRequest = mockCallOpenAiCompatibleChatCompletions.mock.calls[0]?.[0]?.request;
    expect(firstCallRequest?.tool_choice).toBe(toolChoice);
    expect(firstCallRequest?.parallel_tool_calls).toBe(false);
    expect(firstCallRequest?.tools?.[0]?.function?.name).toBe("search_bookmarks");
    expect(mockedSearchBookmarks).toHaveBeenCalledWith(searchQuery);
    expect(reply).toContain("Here are the best matches I found:");
    expect(reply).toContain(bookmarkLink);
    expect(reply).not.toContain(mutatedToken);
  });

  it("accepts assistant tool-call responses where content is null", async () => {
    mockSingleBookmarkSearchResult();
    mockChatToolCallThenContent({
      initialContent: null,
      finalContent: "",
    });

    const pipeline = createPipeline({ userContent: explicitSearchPrompt });

    const reply = await pipeline.runUpstream();

    expect(mockCallOpenAiCompatibleChatCompletions).toHaveBeenCalledTimes(2);
    expect(mockedSearchBookmarks).toHaveBeenCalledWith(searchQuery);
    expect(reply).toContain(bookmarkLink);
  });

  it("preserves model text when all markdown links are tool-allowlisted", async () => {
    mockSingleBookmarkSearchResult();

    const allowlistedReply = `Found one relevant match:\n- ${bookmarkLink}\nWant more?`;
    mockChatToolCallThenContent({
      finalContent: allowlistedReply,
      maxResults: 5,
    });

    const pipeline = createPipeline({ userContent: "hello there" });
    const reply = await pipeline.runUpstream();

    expect(mockCallOpenAiCompatibleChatCompletions).toHaveBeenCalledTimes(2);
    expect(reply).toBe(allowlistedReply);
    expect(reply).not.toContain("Here are the best matches I found:");
  });

  it.each([
    { label: "returns content", content: "I can search that for you." },
    { label: "returns empty content", content: "" },
  ])(
    "uses deterministic fallback when model $label instead of required tool calls",
    async ({ content }) => {
      mockSingleBookmarkSearchResult();
      mockCallOpenAiCompatibleChatCompletions.mockResolvedValueOnce({
        choices: [{ message: { role: "assistant", content } }],
      });

      const pipeline = createPipeline({ userContent: explicitSearchPrompt });
      const reply = await pipeline.runUpstream();

      expect(mockCallOpenAiCompatibleChatCompletions).toHaveBeenCalledTimes(1);
      expect(mockedSearchBookmarks).toHaveBeenCalledWith(explicitSearchPrompt);
      expect(reply).toContain(bookmarkLink);
    },
  );

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

    const pipeline = createPipeline({ userContent: "hello there" });

    const reply = await pipeline.runUpstream();

    expect(mockCallOpenAiCompatibleChatCompletions).toHaveBeenCalledTimes(1);
    expect(reply).toBe("I cannot help with that request.");
  });

  it("supports responses mode tool calls when arguments are object-shaped", async () => {
    mockSingleBookmarkSearchResult();

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

    const pipeline = createPipeline({
      userContent: "search bookmarks for wikipedia",
      apiMode: "responses",
    });

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
    expect(firstCallRequest?.parallel_tool_calls).toBe(false);
    expect(firstCallRequest?.tools?.[0]?.name).toBe("search_bookmarks");
    expect(mockedSearchBookmarks).toHaveBeenCalledWith(searchQuery);
    expect(reply).toContain(bookmarkLink);
  });
});
