describe("OpenAI-compatible client request policy", () => {
  afterEach(() => {
    vi.doUnmock("openai");
    vi.resetModules();
  });

  it("uses one 180-second attempt for streams without changing cached noninteractive requests", async () => {
    vi.resetModules();
    const constructorOptions: Array<{ apiKey: string; baseURL: string }> = [];
    const mockCreate = vi.fn().mockResolvedValue({
      id: "chatcmpl_call",
      choices: [{ message: { role: "assistant", content: "complete" } }],
    });
    const finalChatCompletion = vi.fn().mockResolvedValue({
      id: "chatcmpl_stream",
      choices: [{ message: { role: "assistant", content: "streamed" } }],
    });
    const mockStream = vi.fn().mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield {
          id: "chatcmpl_stream",
          model: "test-model",
          choices: [{ delta: { content: "streamed" } }],
        };
      },
      finalChatCompletion,
    });
    const finalResponse = vi.fn().mockResolvedValue({
      id: "response_stream",
      output_text: "response-streamed",
      output: [],
    });
    const mockResponsesStream = vi.fn().mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield {
          type: "response.output_text.delta",
          delta: "response-streamed",
          response: { id: "response_stream", model: "test-model" },
        };
      },
      finalResponse,
    });
    class MockOpenAI {
      public chat = { completions: { create: mockCreate, stream: mockStream } };
      public responses = { create: vi.fn(), stream: mockResponsesStream };

      public constructor(options: { apiKey: string; baseURL: string }) {
        constructorOptions.push(options);
      }
    }

    vi.doMock("openai", () => ({ __esModule: true, default: MockOpenAI, OpenAI: MockOpenAI }));
    const {
      callOpenAiCompatibleChatCompletions,
      streamOpenAiCompatibleChatCompletions,
      streamOpenAiCompatibleResponses,
    } = await import("@/lib/ai/openai-compatible/openai-compatible-client");
    const request = {
      model: "test-model",
      messages: [{ role: "user" as const, content: "hello" }],
    };
    const connection = {
      baseUrl: "https://example.com",
      apiKey: "test-key",
      tier: "production-a" as const,
      request,
    };

    await callOpenAiCompatibleChatCompletions(connection);
    const streamedContent = vi.fn();
    const streamed = await streamOpenAiCompatibleChatCompletions({
      ...connection,
      onDelta: streamedContent,
    });
    const streamedResponseContent = vi.fn();
    const responseStreamed = await streamOpenAiCompatibleResponses({
      baseUrl: connection.baseUrl,
      apiKey: connection.apiKey,
      tier: connection.tier,
      request: {
        model: request.model,
        input: [{ role: "user", content: "hello" }],
      },
      onDelta: streamedResponseContent,
    });

    expect(constructorOptions).toEqual([{ apiKey: "test-key", baseURL: "https://example.com/v1" }]);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ timeout: 30_000, maxRetries: 1 }),
    );
    expect(mockStream).toHaveBeenCalledWith(
      expect.objectContaining({ stream: true }),
      expect.objectContaining({ timeout: 180_000, maxRetries: 0 }),
    );
    expect(mockResponsesStream).toHaveBeenCalledWith(
      expect.objectContaining({ stream: true }),
      expect.objectContaining({ timeout: 180_000, maxRetries: 0 }),
    );
    expect(streamedContent).toHaveBeenCalledWith("streamed");
    expect(streamed.choices[0]?.message.content).toBe("streamed");
    expect(streamedResponseContent).toHaveBeenCalledWith("response-streamed");
    expect(responseStreamed.output_text).toBe("response-streamed");
  });
});
