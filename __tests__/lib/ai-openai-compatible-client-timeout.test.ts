import type OpenAIClient from "openai";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from "openai/resources/chat/completions";
import type {
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
} from "openai/resources/responses/responses";

type FakeChatCompletion = {
  id: string;
  choices: Array<{ message: { role: "assistant"; content: string } }>;
};
type FakeChatCompletionStream = AsyncIterable<{
  id: string;
  model: string;
  choices: Array<{ delta: { content: string } }>;
}> & { finalChatCompletion: () => Promise<FakeChatCompletion> };
type FakeResponse = { id: string; output_text: string; output: unknown[] };
type FakeResponseStream = AsyncIterable<{
  type: string;
  delta: string;
  response: { id: string; model: string };
}> & { finalResponse: () => Promise<FakeResponse> };

describe("OpenAI-compatible client request policy", () => {
  afterEach(() => {
    vi.doUnmock("openai");
    vi.resetModules();
  });

  it("uses one 180-second attempt for streams without changing cached noninteractive requests", async () => {
    vi.resetModules();
    const constructorOptions: Array<{ apiKey: string; baseURL: string }> = [];
    const mockCreate = vi
      .fn<
        (
          body: ChatCompletionCreateParamsNonStreaming,
          options: OpenAIClient.RequestOptions,
        ) => Promise<FakeChatCompletion>
      >()
      .mockResolvedValue({
        id: "chatcmpl_call",
        choices: [{ message: { role: "assistant", content: "complete" } }],
      });
    const finalChatCompletion = vi.fn<() => Promise<FakeChatCompletion>>().mockResolvedValue({
      id: "chatcmpl_stream",
      choices: [{ message: { role: "assistant", content: "streamed" } }],
    });
    const mockStream = vi
      .fn<
        (
          body: ChatCompletionCreateParamsStreaming,
          options: OpenAIClient.RequestOptions,
        ) => FakeChatCompletionStream
      >()
      .mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield {
            id: "chatcmpl_stream",
            model: "test-model",
            choices: [{ delta: { content: "streamed" } }],
          };
        },
        finalChatCompletion,
      });
    const finalResponse = vi.fn<() => Promise<FakeResponse>>().mockResolvedValue({
      id: "response_stream",
      output_text: "response-streamed",
      output: [],
    });
    const mockResponsesStream = vi
      .fn<
        (
          body: ResponseCreateParamsStreaming,
          options: OpenAIClient.RequestOptions,
        ) => FakeResponseStream
      >()
      .mockReturnValue({
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
      public responses = {
        create:
          vi.fn<
            (
              body: ResponseCreateParamsNonStreaming,
              options: OpenAIClient.RequestOptions,
            ) => Promise<FakeResponse>
          >(),
        stream: mockResponsesStream,
      };

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
      workload: "williamcallahan.com:chat-completions:live" as const,
      request,
    };

    await callOpenAiCompatibleChatCompletions(connection);
    const streamedContent = vi.fn<(delta: string) => void>();
    const streamed = await streamOpenAiCompatibleChatCompletions({
      ...connection,
      onDelta: streamedContent,
    });
    const streamedResponseContent = vi.fn<(delta: string) => void>();
    const responseStreamed = await streamOpenAiCompatibleResponses({
      baseUrl: connection.baseUrl,
      apiKey: connection.apiKey,
      tier: connection.tier,
      workload: connection.workload,
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
