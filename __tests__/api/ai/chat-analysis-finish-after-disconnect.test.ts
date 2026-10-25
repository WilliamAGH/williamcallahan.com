/**
 * A started analysis generation outlives the browser that requested it: the SSE
 * handler finishes the upstream run and persists the validated result even when the
 * client disconnects mid-stream, while a request still waiting in the queue is dropped.
 */

import { NextRequest } from "next/server";
import { createSseStreamResponse } from "@/app/api/ai/chat/[feature]/sse-stream";
import { persistAnalysis } from "@/lib/ai-analysis/writer.server";
import { logChatMessage } from "@/lib/ai/openai-compatible/chat-message-logger";
import { resolveDatabaseAccessMode } from "@/lib/db/connection";
import { UpstreamRequestQueue } from "@/lib/ai/openai-compatible/upstream-request-queue";
import type { ChatLogContext } from "@/types/features/ai-chat";
import type { AiChatModelStreamUpdate } from "@/types/schemas/ai-openai-compatible-client";

vi.mock("@/lib/ai-analysis/writer.server", () => ({
  persistAnalysis: vi.fn<typeof persistAnalysis>().mockResolvedValue(undefined),
}));
vi.mock("@/lib/db/connection", () => ({
  resolveDatabaseAccessMode: vi.fn<typeof resolveDatabaseAccessMode>().mockReturnValue({
    allowWrites: true,
    environment: "production",
    source: "NEXT_PUBLIC_SITE_URL",
  }),
}));
vi.mock("@/lib/ai/openai-compatible/chat-message-logger", () => ({
  logChatMessage: vi.fn<typeof logChatMessage>(),
}));

const mockedPersistAnalysis = vi.mocked(persistAnalysis);

const bookmarkAnalysis = {
  summary: "Useful technical resource for practical implementation decisions.",
  category: "Technology",
  highlights: ["Explains the implementation tradeoffs clearly."],
  contextualDetails: { primaryDomain: "Programming", format: "Article", accessMethod: "Free" },
  relatedResources: ["Related implementation reference"],
  targetAudience: "Developers",
};

const logContext: ChatLogContext = {
  feature: "bookmark-analysis",
  clientIp: "203.0.113.7",
  userAgent: "vitest",
  originHost: "williamcallahan.com",
  pagePath: "/bookmarks/example",
  messages: [],
  model: "qwen3.8-27b",
  apiMode: "chat_completions",
  priority: 0,
};

function createGate(): { promise: Promise<void>; open: () => void } {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

function startAnalysisStream(args: {
  queue: UpstreamRequestQueue;
  runUpstream: (onStreamEvent?: (event: AiChatModelStreamUpdate) => void) => Promise<string>;
}) {
  const browser = new AbortController();
  const upstreamAbort = new AbortController();
  // The test environment's Request drops `init.signal`; pin the browser's connection signal.
  const request = Object.defineProperty(
    new NextRequest("https://williamcallahan.com/api/ai/chat/bookmark-analysis", {
      method: "POST",
    }),
    "signal",
    { value: browser.signal },
  );
  const response = createSseStreamResponse({
    request,
    queue: args.queue,
    priority: 0,
    startTime: Date.now(),
    logContext,
    ragContextStatus: "not_applicable",
    runUpstream: args.runUpstream,
    upstreamAbort,
    analysisTarget: { feature: "bookmark-analysis", entityId: "bookmark-1" },
  });
  return { browser, upstreamAbort, response };
}

describe("AI analysis generation after client disconnect", () => {
  beforeEach(() => {
    mockedPersistAnalysis.mockClear();
  });

  it("persists the validated analysis when the browser leaves after output started", async () => {
    const outputStarted = createGate();
    const releaseCompletion = createGate();
    const persisted = createGate();
    mockedPersistAnalysis.mockImplementationOnce(() => {
      persisted.open();
      return Promise.resolve();
    });

    const queue = new UpstreamRequestQueue({ key: "finish-after-disconnect", maxParallel: 1 });
    const { browser, upstreamAbort, response } = startAnalysisStream({
      queue,
      runUpstream: async (onStreamEvent) => {
        onStreamEvent?.({ event: "message_delta", data: { delta: '{"summary":' } });
        outputStarted.open();
        await releaseCompletion.promise;
        const text = JSON.stringify(bookmarkAnalysis);
        onStreamEvent?.({ event: "message_done", data: { message: text } });
        return text;
      },
    });

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Expected a readable SSE body");
    await outputStarted.promise;
    await reader.cancel();
    browser.abort();

    expect(upstreamAbort.signal.aborted).toBe(false);
    expect(queue.snapshot.running).toBe(1);

    releaseCompletion.open();
    await persisted.promise;

    expect(mockedPersistAnalysis).toHaveBeenCalledWith(
      "bookmarks",
      "bookmark-1",
      expect.objectContaining({ summary: bookmarkAnalysis.summary }),
    );
  });

  it("drops a still-queued analysis when the browser leaves before it starts", async () => {
    const releaseBlocker = createGate();
    const queue = new UpstreamRequestQueue({ key: "drop-while-queued", maxParallel: 1 });
    const blocker = queue.enqueue({
      signal: new AbortController().signal,
      run: async () => {
        await releaseBlocker.promise;
        return "blocker";
      },
    });

    const runQueued = vi.fn<() => Promise<string>>().mockResolvedValue("{}");
    const { browser, upstreamAbort } = startAnalysisStream({ queue, runUpstream: runQueued });

    browser.abort();
    releaseBlocker.open();
    await blocker.result;

    expect(upstreamAbort.signal.aborted).toBe(true);
    expect(queue.snapshot.pending).toBe(0);
    expect(runQueued).not.toHaveBeenCalled();
    expect(mockedPersistAnalysis).not.toHaveBeenCalled();
  });
});
