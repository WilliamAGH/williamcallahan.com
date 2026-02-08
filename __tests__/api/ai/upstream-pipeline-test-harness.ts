import { buildChatPipeline } from "@/app/api/ai/chat/[feature]/upstream-pipeline";
import { searchBookmarks } from "@/lib/search/searchers/dynamic-searchers";
import type { AiChatModelStreamEvent, ValidatedRequestContext } from "@/types/features/ai-chat";
import type { OpenAiCompatibleChatMessage } from "@/types/schemas/ai-openai-compatible";

export const mockCallOpenAiCompatibleChatCompletions = vi.fn().mockResolvedValue({
  choices: [{ message: { content: "ok" } }],
});
export const mockCallOpenAiCompatibleResponses = vi.fn().mockResolvedValue({
  id: "response_1",
  output_text: "ok",
  output: [],
});
export const mockStreamOpenAiCompatibleChatCompletions = vi.fn();
export const mockStreamOpenAiCompatibleResponses = vi.fn();
const mockBuildChatMessages = vi
  .fn()
  .mockReturnValue([
    { role: "user", content: "search bookmarks" } satisfies OpenAiCompatibleChatMessage,
  ]);
export const mockGetUpstreamRequestQueue = vi.fn().mockReturnValue({
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

export const mockedSearchBookmarks = vi.mocked(searchBookmarks);
export const conversationId = "77777777-7777-4777-8777-777777777777";
export const bookmarkTitle = "Signs of AI writing / LLM written text (Wikipedia article)";
export const bookmarkUrl = "/bookmarks/en-wikipedia-org-wiki-wikipedia-signs-of-ai-writing";
export const bookmarkLink = `[${bookmarkTitle}](${bookmarkUrl})`;
export const searchQuery = "wikipedia ai writing";
export const explicitSearchPrompt = "search bookmarks for wikipedia";
export const streamModel = "test-model";

const bookmarkResult = {
  id: "bookmark-1",
  type: "bookmark" as const,
  title: bookmarkTitle,
  description: "Wikipedia article bookmark",
  url: bookmarkUrl,
  score: 99,
};

export type ApiMode = "chat_completions" | "responses";
export type ChatFeature = "terminal_chat" | "bookmark-analysis";
export type EventPayload = AiChatModelStreamEvent;
export type PipelineOptions = {
  feature?: ChatFeature;
  temperature?: number;
  userContent?: string;
  apiMode?: ApiMode;
};

type StreamHandlerArgs = {
  onStart?: (meta: { id: string; model: string }) => void;
  onDelta?: (delta: string) => void;
};

export function createValidatedContext(args?: PipelineOptions): ValidatedRequestContext {
  return {
    feature: args?.feature ?? "terminal_chat",
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

export function createPipeline(args?: PipelineOptions) {
  return buildChatPipeline({
    feature: args?.feature ?? "terminal_chat",
    ctx: createValidatedContext(args),
    ragResult: { augmentedPrompt: undefined, status: "not_applicable" },
    signal: new AbortController().signal,
  });
}

export async function runPipelineWithEvents(args?: PipelineOptions): Promise<{
  reply: string;
  events: EventPayload[];
}> {
  const events: EventPayload[] = [];
  const reply = await createPipeline(args).runUpstream((event) => events.push(event));
  return { reply, events };
}

export function mockSingleBookmarkSearchResult(): void {
  mockedSearchBookmarks.mockResolvedValue([bookmarkResult]);
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

export function resetPipelineMocks(): void {
  mockedSearchBookmarks.mockReset();
  mockCallOpenAiCompatibleChatCompletions.mockReset();
  mockCallOpenAiCompatibleResponses.mockReset();
  mockStreamOpenAiCompatibleChatCompletions.mockReset();
  mockStreamOpenAiCompatibleResponses.mockReset();
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
}

export function expectSingleMessageDoneEvent(events: EventPayload[], message: string): void {
  expect(events).toEqual([{ event: "message_done", data: { message } }]);
}

export function expectDeterministicBookmarkReply(reply: string, forbiddenToken?: string): void {
  expect(reply).toContain("Here are the best matches I found:");
  expect(reply).toContain(bookmarkLink);
  if (forbiddenToken) {
    expect(reply).not.toContain(forbiddenToken);
  }
}

export function expectStandardStreamEvents(
  events: EventPayload[],
  args: { id: string; apiMode: ApiMode },
): void {
  expect(events).toEqual([
    { event: "message_start", data: { id: args.id, model: streamModel, apiMode: args.apiMode } },
    { event: "message_delta", data: { delta: "o" } },
    { event: "message_delta", data: { delta: "k" } },
    { event: "message_done", data: { message: "ok" } },
  ]);
}

export function buildSearchBookmarksToolCall(params?: {
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

export function mockChatToolCallThenContent(params: {
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
      choices: [{ message: firstMessage }],
    })
    .mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: params.finalContent } }],
    });
}

export function mockStreamingSearchBookmarksToolCall(args: {
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
