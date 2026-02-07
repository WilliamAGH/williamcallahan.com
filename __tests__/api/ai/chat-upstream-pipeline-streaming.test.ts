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
const streamModel = "test-model";

type EventPayload = { event: string; data: unknown };
type PipelineOptions = {
  temperature?: number;
  userContent?: string;
  apiMode?: "chat_completions" | "responses";
};
type StreamHandlerArgs = {
  onStart?: (meta: { id: string; model: string }) => void;
  onDelta?: (delta: string) => void;
};

function createValidatedContext(args?: PipelineOptions): ValidatedRequestContext {
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

function createPipeline(args?: PipelineOptions) {
  return buildChatPipeline({
    feature: "terminal_chat",
    ctx: createValidatedContext(args),
    ragResult: { augmentedPrompt: undefined, status: "not_applicable" },
    signal: new AbortController().signal,
  });
}

function mockSingleBookmarkSearchResult(): void {
  mockedSearchBookmarks.mockResolvedValue([
    {
      id: "bookmark-1",
      type: "bookmark",
      title: bookmarkTitle,
      description: "Wikipedia article bookmark",
      url: bookmarkUrl,
      score: 99,
    },
  ]);
}

async function runPipelineWithEvents(args?: PipelineOptions): Promise<{
  reply: string;
  events: EventPayload[];
}> {
  const events: EventPayload[] = [];
  const reply = await createPipeline(args).runUpstream((event) => events.push(event));
  return { reply, events };
}

function expectSingleMessageDoneEvent(events: EventPayload[], message: string): void {
  expect(events).toEqual([{ event: "message_done", data: { message } }]);
}

function expectDeterministicBookmarkReply(reply: string, forbiddenToken?: string): void {
  expect(reply).toContain("Here are the best matches I found:");
  expect(reply).toContain(bookmarkLink);
  if (forbiddenToken) {
    expect(reply).not.toContain(forbiddenToken);
  }
}

function expectStandardStreamEvents(
  events: EventPayload[],
  args: { id: string; apiMode: "chat_completions" | "responses" },
): void {
  expect(events).toEqual([
    { event: "message_start", data: { id: args.id, model: streamModel, apiMode: args.apiMode } },
    { event: "message_delta", data: { delta: "o" } },
    { event: "message_delta", data: { delta: "k" } },
    { event: "message_done", data: { message: "ok" } },
  ]);
}

function mockStreamDefaultChatResponse(): void {
  mockStreamOpenAiCompatibleChatCompletions.mockImplementation(
    ({ onStart, onDelta }: StreamHandlerArgs) => {
      onStart?.({ id: "chatcmpl_1", model: streamModel });
      onDelta?.("o");
      onDelta?.("k");
      return Promise.resolve({
        id: "chatcmpl_1",
        choices: [{ message: { role: "assistant", content: "ok" } }],
      });
    },
  );
}

function mockStreamDefaultResponsesResponse(): void {
  mockStreamOpenAiCompatibleResponses.mockImplementation(
    ({ onStart, onDelta }: StreamHandlerArgs) => {
      onStart?.({ id: "response_1", model: streamModel });
      onDelta?.("o");
      onDelta?.("k");
      return Promise.resolve({
        id: "response_1",
        output_text: "ok",
        output: [],
      });
    },
  );
}

function mockStreamingSearchBookmarksToolCall(args: {
  streamId: string;
  query?: string;
  maxResults?: number;
}): void {
  const query = args.query ?? searchQuery;
  const toolCallArgs =
    typeof args.maxResults === "number" ? { query, maxResults: args.maxResults } : { query };

  mockStreamOpenAiCompatibleChatCompletions.mockImplementationOnce(
    ({ onStart }: StreamHandlerArgs) => {
      onStart?.({ id: args.streamId, model: streamModel });
      return Promise.resolve({
        id: args.streamId,
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
                    arguments: JSON.stringify(toolCallArgs),
                  },
                },
              ],
            },
          },
        ],
      });
    },
  );
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
    mockStreamDefaultChatResponse();
    mockStreamDefaultResponsesResponse();
  });

  it("defaults terminal chat to feature-specific model params when not provided", async () => {
    await createPipeline().runUpstream();

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
    await createPipeline({ temperature: 0.75 }).runUpstream();

    expect(mockCallOpenAiCompatibleChatCompletions).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          temperature: 0.75,
        }),
      }),
    );
  });

  it("emits normalized stream events for chat completions", async () => {
    const { reply, events } = await runPipelineWithEvents();
    expect(reply).toBe("ok");
    expect(mockStreamOpenAiCompatibleChatCompletions).toHaveBeenCalledTimes(1);
    expect(mockCallOpenAiCompatibleChatCompletions).not.toHaveBeenCalled();
    expectStandardStreamEvents(events, { id: "chatcmpl_1", apiMode: "chat_completions" });
  });

  it("streams responses mode events", async () => {
    const { reply, events } = await runPipelineWithEvents({ apiMode: "responses" });
    expect(reply).toBe("ok");
    expect(mockStreamOpenAiCompatibleResponses).toHaveBeenCalledTimes(1);
    expect(mockCallOpenAiCompatibleResponses).not.toHaveBeenCalled();
    expect(mockCallOpenAiCompatibleChatCompletions).not.toHaveBeenCalled();
    expectStandardStreamEvents(events, { id: "response_1", apiMode: "responses" });
  });

  it.each([
    {
      label: "suppresses post-tool deltas and emits deterministic links",
      streamId: "chatcmpl_tool_auto",
      finalReply:
        "Here are links:\n- [Wrong Link](/bookmarks/en-wikipedia-org-wiki-wikipedia-signs-of-ai-writing-mutated)",
      expectDeterministicReply: true,
      forbiddenToken: "en-wikipedia-org-wiki-wikipedia-signs-of-ai-writing-mutated",
    },
    {
      label: "keeps assistant text when links are allowlisted",
      streamId: "chatcmpl_tool_auto_allowlist",
      finalReply: `Found one relevant match:\n- ${bookmarkLink}\nWant more?`,
      expectDeterministicReply: false,
      forbiddenToken: undefined,
    },
  ])("$label", async ({ streamId, finalReply, expectDeterministicReply, forbiddenToken }) => {
    mockSingleBookmarkSearchResult();
    mockStreamingSearchBookmarksToolCall({ streamId, maxResults: 5 });
    mockCallOpenAiCompatibleChatCompletions.mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: finalReply } }],
    });

    const { reply, events } = await runPipelineWithEvents({ userContent: "hello there" });
    if (expectDeterministicReply) {
      expectDeterministicBookmarkReply(reply, forbiddenToken);
    } else {
      expect(reply).toBe(finalReply);
    }

    expectSingleMessageDoneEvent(events, expectDeterministicReply ? reply : finalReply);
    expect(mockStreamOpenAiCompatibleChatCompletions).toHaveBeenCalledTimes(1);
    expect(mockCallOpenAiCompatibleChatCompletions).toHaveBeenCalledTimes(1);
    const streamRequest = mockStreamOpenAiCompatibleChatCompletions.mock.calls[0]?.[0]?.request;
    expect(streamRequest?.tool_choice).toBe("auto");
    expect(streamRequest?.parallel_tool_calls).toBe(false);
  });

  it("emits refusal text as streamed content when completion has no assistant content", async () => {
    mockStreamOpenAiCompatibleChatCompletions.mockImplementationOnce(
      ({ onStart }: StreamHandlerArgs) => {
        onStart?.({ id: "chatcmpl_refusal", model: streamModel });
        return Promise.resolve({
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
      },
    );

    const { reply, events } = await runPipelineWithEvents({ userContent: "hello there" });
    expect(reply).toBe("I cannot help with that request.");
    expect(events).toEqual([
      {
        event: "message_start",
        data: { id: "chatcmpl_refusal", model: streamModel, apiMode: "chat_completions" },
      },
      { event: "message_delta", data: { delta: "I cannot help with that request." } },
      { event: "message_done", data: { message: "I cannot help with that request." } },
    ]);
  });
});
