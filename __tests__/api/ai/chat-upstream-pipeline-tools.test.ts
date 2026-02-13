import {
  bookmarkLink,
  createPipeline,
  explicitSearchPrompt,
  mockCallOpenAiCompatibleChatCompletions,
  mockCallOpenAiCompatibleResponses,
  mockChatToolCallThenContent,
  mockGetUpstreamRequestQueue,
  mockSingleBookmarkSearchResult,
  mockedSearchBookmarks,
  resetPipelineMocks,
  searchQuery,
} from "./upstream-pipeline-test-harness";

describe("AI Chat Upstream Pipeline Tools", () => {
  beforeEach(() => {
    resetPipelineMocks();
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

    const reply = await createPipeline({ userContent }).runUpstream();

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

    const reply = await createPipeline({ userContent: explicitSearchPrompt }).runUpstream();

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

    const reply = await createPipeline({ userContent: "hello there" }).runUpstream();

    expect(mockCallOpenAiCompatibleChatCompletions).toHaveBeenCalledTimes(2);
    expect(reply).toBe(allowlistedReply);
    expect(reply).not.toContain("Here are the best matches I found:");
  });

  it("uses deterministic fallback when model returns empty content instead of required tool calls", async () => {
    mockSingleBookmarkSearchResult();
    mockCallOpenAiCompatibleChatCompletions.mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: "" } }],
    });

    const reply = await createPipeline({ userContent: explicitSearchPrompt }).runUpstream();

    expect(mockCallOpenAiCompatibleChatCompletions).toHaveBeenCalledTimes(1);
    expect(mockedSearchBookmarks).toHaveBeenCalledWith("wikipedia");
    expect(reply).toContain(bookmarkLink);
  });

  it("returns a safe message when deterministic fallback tool searcher throws", async () => {
    const { default: logger } = await import("@/lib/utils/logger");
    logger.setSilent(true);

    mockedSearchBookmarks.mockRejectedValueOnce(new Error("searcher exploded"));
    mockCallOpenAiCompatibleChatCompletions.mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: "" } }],
    });

    let reply: string;
    try {
      reply = await createPipeline({ userContent: explicitSearchPrompt }).runUpstream();
    } finally {
      logger.setSilent(false);
    }

    expect(mockCallOpenAiCompatibleChatCompletions).toHaveBeenCalledTimes(1);
    expect(mockedSearchBookmarks).toHaveBeenCalledWith("wikipedia");
    expect(reply).toBe(
      "Sorry, I encountered an error while searching. Please try a different query.",
    );
  });

  it("preserves valid model text when forced tool is not called", async () => {
    const modelText = "I can search that for you.";
    mockCallOpenAiCompatibleChatCompletions.mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: modelText } }],
    });

    const reply = await createPipeline({ userContent: explicitSearchPrompt }).runUpstream();

    expect(mockCallOpenAiCompatibleChatCompletions).toHaveBeenCalledTimes(1);
    expect(mockedSearchBookmarks).not.toHaveBeenCalled();
    expect(reply).toBe(modelText);
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

    const reply = await createPipeline({ userContent: "hello there" }).runUpstream();

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

    const reply = await createPipeline({
      userContent: explicitSearchPrompt,
      apiMode: "responses",
    }).runUpstream();

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
