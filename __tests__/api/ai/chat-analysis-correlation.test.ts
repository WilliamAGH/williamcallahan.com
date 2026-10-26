import { NextRequest } from "next/server";
import {
  createValidatedContext,
  mockStreamOpenAiCompatibleChatCompletions,
  resetPipelineMocks,
} from "./upstream-pipeline-test-harness";
import { buildChatPipeline } from "@/app/api/ai/chat/[feature]/upstream-pipeline";
import { createSseStreamResponse } from "@/app/api/ai/chat/[feature]/sse-stream";

const validAnalysisPayload = {
  summary: "A browser automation CLI.",
  category: "Developer Tools",
  highlights: ["Browser automation"],
  relatedResources: ["Playwright"],
  targetAudience: "Software developers",
  contextualDetails: { primaryDomain: null, format: null, accessMethod: null },
};
const validAnalysis = JSON.stringify(validAnalysisPayload);
const invalidAnalysis = JSON.stringify({
  ...validAnalysisPayload,
  summary: "s".repeat(321),
});

function upstreamResponse(content: string) {
  return { choices: [{ message: { role: "assistant" as const, content } }] };
}

function startAnalysis(controller = new AbortController(), finishAfterDisconnect = false) {
  const upstreamAbort = new AbortController();
  const pipeline = buildChatPipeline({
    feature: "bookmark-analysis",
    ctx: createValidatedContext({ feature: "bookmark-analysis" }),
    ragResult: { augmentedPrompt: undefined, status: "not_applicable" },
    signal: upstreamAbort.signal,
  });
  // The repository NextRequest mock does not copy RequestInit.signal.
  const request = Object.assign(
    new NextRequest("https://localhost/api/ai/chat/bookmark-analysis"),
    {
      signal: controller.signal,
    },
  );
  return createSseStreamResponse({
    request,
    ...pipeline,
    ragContextStatus: "not_applicable",
    upstreamAbort,
    finishAfterDisconnect,
  }).response;
}

describe("analysis execution correlation", () => {
  const warningCalls: unknown[][] = [];
  const terminalOutput: unknown[][] = [];

  function terminalLines(): string[] {
    return terminalOutput.flatMap(([line]) =>
      typeof line === "string" && line.includes("[AI Chat Message]") ? [line] : [],
    );
  }

  function repairWarnings() {
    return warningCalls.filter(
      ([message]) =>
        typeof message === "string" && message.includes("retrying with stricter repair prompt"),
    );
  }

  beforeEach(() => {
    resetPipelineMocks();
    warningCalls.length = 0;
    terminalOutput.length = 0;
    vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      warningCalls.push(args);
    });
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      terminalOutput.push(args);
    });
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      terminalOutput.push(args);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    { outcome: "success", status: 200, repairs: 1 },
    { outcome: "finish-after-disconnect", status: 200, repairs: 1 },
    { outcome: "exhaustion", status: 502, repairs: 2 },
    { outcome: "abort-after-repair", status: 499, repairs: 1 },
    { outcome: "abort-before-start", status: 499, repairs: 0 },
  ])(
    "joins analysis repair warnings to terminal outcomes: $outcome",
    async ({ outcome, status, repairs }) => {
      const controller = new AbortController();
      mockStreamOpenAiCompatibleChatCompletions.mockResolvedValueOnce(
        upstreamResponse(invalidAnalysis),
      );
      if (outcome === "success") {
        mockStreamOpenAiCompatibleChatCompletions.mockResolvedValue(
          upstreamResponse(validAnalysis),
        );
      } else if (outcome === "finish-after-disconnect") {
        mockStreamOpenAiCompatibleChatCompletions.mockImplementationOnce(() => {
          controller.abort();
          return Promise.resolve(upstreamResponse(validAnalysis));
        });
      } else if (outcome === "exhaustion") {
        mockStreamOpenAiCompatibleChatCompletions.mockResolvedValue(
          upstreamResponse(invalidAnalysis),
        );
      } else if (outcome === "abort-after-repair") {
        mockStreamOpenAiCompatibleChatCompletions.mockImplementationOnce(() => {
          controller.abort();
          return Promise.reject(new DOMException("Request aborted", "AbortError"));
        });
      } else {
        controller.abort();
      }

      const body = await startAnalysis(controller, outcome === "finish-after-disconnect").text();
      await vi.waitFor(() => expect(terminalLines()).toHaveLength(1));
      const terminal = terminalLines()[0];
      expect(terminal).toContain(`status=${status}`);
      const messageId = terminal?.match(/msgId=([\da-f-]{36})/)?.[1];
      expect(messageId).toMatch(/^[\da-f-]{36}$/);
      expect(repairWarnings()).toHaveLength(repairs);
      for (const [, details] of repairWarnings()) {
        expect(details).toMatchObject({
          messageId,
          feature: "bookmark-analysis",
          reason: expect.stringContaining("summary"),
        });
      }
      if (outcome === "finish-after-disconnect") {
        expect(body).not.toContain("event: done");
        expect(terminal).toMatch(/outputChars=[1-9]\d*/);
        expect(console.error).not.toHaveBeenCalled();
      } else if (status === 200) {
        expect(body).toContain("event: done");
        expect(body).toContain("A browser automation CLI.");
      } else if (status === 499) {
        expect(body).not.toContain("event: done");
        expect(terminal).toContain('error="Request aborted"');
        expect(terminal).toMatch(/^\[INFO\] \[AI Chat Message\]/);
        expect(console.error).not.toHaveBeenCalled();
      } else {
        expect(body).toContain("event: error");
      }
      if (repairs === 0) expect(mockStreamOpenAiCompatibleChatCompletions).not.toHaveBeenCalled();
    },
  );

  it("keeps concurrent analysis executions distinct within one conversation", async () => {
    mockStreamOpenAiCompatibleChatCompletions
      .mockResolvedValueOnce(upstreamResponse(invalidAnalysis))
      .mockResolvedValueOnce(upstreamResponse(invalidAnalysis))
      .mockResolvedValue(upstreamResponse(validAnalysis));

    const first = startAnalysis();
    const second = startAnalysis();
    await Promise.all([first.text(), second.text()]);
    expect(terminalLines()).toHaveLength(2);
    const messageIds = terminalLines().map((line) => line.match(/msgId=([\da-f-]{36})/)?.[1]);
    expect(messageIds.every((id) => typeof id === "string")).toBe(true);
    expect(new Set(messageIds).size).toBe(2);
    expect(repairWarnings()).toHaveLength(2);
    for (const messageId of messageIds) {
      expect(
        repairWarnings().filter(
          ([, details]) =>
            typeof details === "object" &&
            details !== null &&
            "messageId" in details &&
            details.messageId === messageId,
        ),
      ).toHaveLength(1);
    }
  });
});
