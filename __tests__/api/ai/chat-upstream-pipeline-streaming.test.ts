import {
  bookmarkLink,
  createPipeline,
  expectDeterministicBookmarkReply,
  expectSingleMessageDoneEvent,
  expectStandardStreamEvents,
  mockCallOpenAiCompatibleChatCompletions,
  mockCallOpenAiCompatibleResponses,
  mockGetUpstreamRequestQueue,
  mockSingleBookmarkSearchResult,
  mockStreamOpenAiCompatibleChatCompletions,
  mockStreamOpenAiCompatibleResponses,
  mockStreamingSearchBookmarksToolCall,
  resetPipelineMocks,
  runPipelineWithEvents,
  streamModel,
  type EventPayload,
} from "./upstream-pipeline-test-harness";

const ANALYSIS_PROMPT = "Analyze this bookmark";

describe("AI Chat Upstream Pipeline Streaming", () => {
  beforeEach(() => {
    resetPipelineMocks();
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

  it("streams bookmark-analysis events when no tool flow is involved", async () => {
    const validAnalysis = JSON.stringify({
      summary: "z-agent-browser is a Rust-based browser automation CLI.",
      category: "Developer Tools",
      highlights: ["Stealth mode", "Playwright MCP integration"],
      contextualDetails: {
        primaryDomain: "Browser automation",
        format: "GitHub repository",
        accessMethod: "Open source",
      },
      relatedResources: ["agent-browser", "Playwright"],
      targetAudience: "Developers building browser automation agents",
    });

    mockStreamOpenAiCompatibleChatCompletions.mockImplementationOnce(({ onStart, onDelta }) => {
      onStart?.({ id: "chatcmpl_analysis", model: streamModel });
      onDelta?.(validAnalysis);
      return Promise.resolve({
        id: "chatcmpl_analysis",
        choices: [{ message: { role: "assistant", content: validAnalysis } }],
      });
    });

    const { reply, events } = await runPipelineWithEvents({
      feature: "bookmark-analysis",
      userContent: ANALYSIS_PROMPT,
    });

    expect(reply).toBe(validAnalysis);
    expect(events).toEqual([
      {
        event: "message_start",
        data: { id: "chatcmpl_analysis", model: streamModel, apiMode: "chat_completions" },
      },
      { event: "message_delta", data: { delta: validAnalysis } },
      { event: "message_done", data: { message: validAnalysis } },
    ]);
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
    mockStreamOpenAiCompatibleChatCompletions.mockImplementationOnce(({ onStart }) => {
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
    });

    const { reply, events } = await runPipelineWithEvents({ userContent: "hello there" });
    const expectedMessage = "I cannot help with that request.";

    expect(reply).toBe(expectedMessage);
    expect(events).toEqual([
      {
        event: "message_start",
        data: { id: "chatcmpl_refusal", model: streamModel, apiMode: "chat_completions" },
      },
      { event: "message_delta", data: { delta: expectedMessage } },
      { event: "message_done", data: { message: expectedMessage } },
    ] satisfies EventPayload[]);
  });
});
