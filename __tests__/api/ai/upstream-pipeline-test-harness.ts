import { buildChatPipeline } from "@/app/api/ai/chat/[feature]/upstream-pipeline";
import {
  UpstreamRequestQueue,
  type getUpstreamRequestQueue,
} from "@/lib/ai/openai-compatible/upstream-request-queue";
import type { buildChatMessages } from "@/lib/ai/openai-compatible/chat-messages";
import type {
  callOpenAiCompatibleChatCompletions,
  callOpenAiCompatibleResponses,
  streamOpenAiCompatibleChatCompletions,
  streamOpenAiCompatibleResponses,
} from "@/lib/ai/openai-compatible/openai-compatible-client";
import type {
  buildUpstreamQueueKey,
  resolveOpenAiCompatibleFeatureConfig,
  resolvePreferredUpstreamModel,
} from "@/lib/ai/openai-compatible/feature-config";
import { searchBookmarks, type searchBooks } from "@/lib/search/searchers/dynamic-searchers";
import type { searchBlogPostsServerSide } from "@/lib/blog/server-search";
import type { searchTags } from "@/lib/search/searchers/tag-search";
import type {
  searchEducation,
  searchExperience,
  searchInvestments,
  searchProjects,
} from "@/lib/search/searchers/static-searchers";
import type { searchAiAnalysis } from "@/lib/search/searchers/ai-analysis-searcher";
import type { searchThoughts } from "@/lib/search/searchers/thoughts-search";
import type { ValidatedRequestContext } from "@/types/features/ai-chat";
import type {
  OpenAiCompatibleChatCompletionsResponse,
  OpenAiCompatibleChatMessage,
} from "@/types/schemas/ai-openai-compatible";
import type { AiChatModelStreamUpdate } from "@/types/schemas/ai-openai-compatible-client";

export const mockCallOpenAiCompatibleChatCompletions = vi
  .fn<typeof callOpenAiCompatibleChatCompletions>()
  .mockResolvedValue({
    choices: [{ message: { role: "assistant", content: "ok" } }],
  });
export const mockCallOpenAiCompatibleResponses = vi
  .fn<typeof callOpenAiCompatibleResponses>()
  .mockResolvedValue({
    id: "response_1",
    output_text: "ok",
    output: [],
  });
export const mockStreamOpenAiCompatibleChatCompletions =
  vi.fn<typeof streamOpenAiCompatibleChatCompletions>();
export const mockStreamOpenAiCompatibleResponses = vi.fn<typeof streamOpenAiCompatibleResponses>();
const mockBuildChatMessages = vi
  .fn<typeof buildChatMessages>()
  .mockReturnValue([
    { role: "user", content: "search bookmarks" } satisfies OpenAiCompatibleChatMessage,
  ]);
export const mockGetUpstreamRequestQueue = vi
  .fn<typeof getUpstreamRequestQueue>()
  .mockImplementation((args) => new UpstreamRequestQueue(args));

vi.mock("@/lib/ai/openai-compatible/openai-compatible-client", () => ({
  assertOpenAiCompatibleResponsesSucceeded: (response: {
    id: string;
    status?: string;
    error?: { code: string; message: string } | null;
  }) => {
    if (response.status === undefined || response.status === "completed") return;
    const detail = response.error
      ? `${response.error.code}: ${response.error.message}`
      : `No provider error details returned for status "${response.status}".`;
    throw Object.assign(
      new Error(
        `[AI] Responses API returned status "${response.status}" for ${response.id}: ${detail}`,
      ),
      { name: "OpenAiCompatibleResponsesFailureError", status: 502 },
    );
  },
  callOpenAiCompatibleChatCompletions: (
    ...args: Parameters<typeof callOpenAiCompatibleChatCompletions>
  ) => mockCallOpenAiCompatibleChatCompletions(...args),
  callOpenAiCompatibleResponses: (...args: Parameters<typeof callOpenAiCompatibleResponses>) =>
    mockCallOpenAiCompatibleResponses(...args),
  streamOpenAiCompatibleChatCompletions: (
    ...args: Parameters<typeof streamOpenAiCompatibleChatCompletions>
  ) => mockStreamOpenAiCompatibleChatCompletions(...args),
  streamOpenAiCompatibleResponses: (...args: Parameters<typeof streamOpenAiCompatibleResponses>) =>
    mockStreamOpenAiCompatibleResponses(...args),
}));

vi.mock("@/lib/ai/openai-compatible/chat-messages", () => ({
  buildChatMessages: (...args: Parameters<typeof buildChatMessages>) =>
    mockBuildChatMessages(...args),
}));

vi.mock("@/lib/ai/openai-compatible/upstream-request-queue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/openai-compatible/upstream-request-queue")>()),
  getUpstreamRequestQueue: (...args: Parameters<typeof getUpstreamRequestQueue>) =>
    mockGetUpstreamRequestQueue(...args),
}));

vi.mock("@/lib/ai/openai-compatible/feature-config", () => ({
  resolveOpenAiCompatibleFeatureConfig: vi
    .fn<typeof resolveOpenAiCompatibleFeatureConfig>()
    .mockReturnValue({
      baseUrl: "https://example.com",
      model: "qwen/qwen3-32b",
      maxParallel: 1,
    }),
  resolvePreferredUpstreamModel: vi.fn<typeof resolvePreferredUpstreamModel>().mockReturnValue({
    primaryModel: "qwen/qwen3-32b",
    fallbackModel: undefined,
  }),
  buildUpstreamQueueKey: vi.fn<typeof buildUpstreamQueueKey>(({ baseUrl, model, apiMode }) => {
    const route = apiMode === "responses" ? "responses" : "chat/completions";
    const primaryModel = model.split(",")[0]?.trim() ?? model;
    return `${baseUrl}/v1/${route}::${primaryModel}`;
  }),
}));

vi.mock("@/lib/search/searchers/dynamic-searchers", () => ({
  searchBookmarks: vi.fn<typeof searchBookmarks>(),
  searchBooks: vi.fn<typeof searchBooks>().mockResolvedValue([]),
}));

vi.mock("@/lib/blog/server-search", () => ({
  searchBlogPostsServerSide: vi.fn<typeof searchBlogPostsServerSide>().mockResolvedValue([]),
}));

vi.mock("@/lib/search/searchers/tag-search", () => ({
  searchTags: vi.fn<typeof searchTags>().mockResolvedValue([]),
}));

vi.mock("@/lib/search/searchers/static-searchers", () => ({
  searchInvestments: vi.fn<typeof searchInvestments>().mockResolvedValue([]),
  searchExperience: vi.fn<typeof searchExperience>().mockResolvedValue([]),
  searchEducation: vi.fn<typeof searchEducation>().mockResolvedValue([]),
  searchProjects: vi.fn<typeof searchProjects>().mockResolvedValue([]),
}));

vi.mock("@/lib/search/searchers/ai-analysis-searcher", () => ({
  searchAiAnalysis: vi.fn<typeof searchAiAnalysis>().mockResolvedValue([]),
}));

vi.mock("@/lib/search/searchers/thoughts-search", () => ({
  searchThoughts: vi.fn<typeof searchThoughts>().mockResolvedValue([]),
}));

export const mockedSearchBookmarks = vi.mocked(searchBookmarks);
export const conversationId = "77777777-7777-4777-8777-777777777777";
export const bookmarkTitle = "Signs of AI writing / LLM written text (Wikipedia article)";
export const bookmarkUrl = "/bookmarks/en-wikipedia-org-wiki-wikipedia-signs-of-ai-writing";
export const bookmarkLink = `[${bookmarkTitle}](${bookmarkUrl})`;
export const searchQuery = "wikipedia ai writing";
export const explicitSearchPrompt = "search bookmarks for wikipedia";
export const streamModel = "qwen/qwen3-32b";

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
export type EventPayload = AiChatModelStreamUpdate;
export type PipelineOptions = {
  feature?: ChatFeature;
  temperature?: number;
  userContent?: string;
  apiMode?: ApiMode;
  reasoningEffort?: ValidatedRequestContext["parsedBody"]["reasoning_effort"];
  responseFormat?: ValidatedRequestContext["parsedBody"]["response_format"];
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
      ...(args?.reasoningEffort !== undefined ? { reasoning_effort: args.reasoningEffort } : {}),
      ...(args?.responseFormat ? { response_format: args.responseFormat } : {}),
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
  mockStreamOpenAiCompatibleChatCompletions.mockImplementation(({ onStart, onDelta }) => {
    onStart?.({ id: "chatcmpl_1", model: streamModel });
    onDelta?.("o");
    onDelta?.("k");
    return Promise.resolve({
      id: "chatcmpl_1",
      choices: [{ message: { role: "assistant", content: "ok" } }],
    });
  });
}

function mockStreamDefaultResponsesResponse(): void {
  mockStreamOpenAiCompatibleResponses.mockImplementation(({ onStart, onDelta }) => {
    onStart?.({ id: "response_1", model: streamModel });
    onDelta?.("o");
    onDelta?.("k");
    return Promise.resolve({
      id: "response_1",
      output_text: "ok",
      output: [],
    });
  });
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

type ChatCompletionsAssistantMessage =
  OpenAiCompatibleChatCompletionsResponse["choices"][number]["message"];

export function mockChatToolCallThenContent(params: {
  finalContent: string;
  initialContent?: string | null;
  query?: string;
  maxResults?: number;
}): void {
  const firstMessageBase: ChatCompletionsAssistantMessage = {
    role: "assistant",
    tool_calls: [buildSearchBookmarksToolCall(params)],
  };
  const firstMessage: ChatCompletionsAssistantMessage =
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

  mockStreamOpenAiCompatibleChatCompletions.mockImplementationOnce(({ onStart }) => {
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
  });
}
