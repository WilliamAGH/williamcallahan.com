/**
 * A started analysis generation outlives the browser that requested it: once the
 * client disconnects mid-stream, the run still finishes, the analysis becomes
 * readable through the reader path, and its cache tags are revalidated inside an
 * `after()` callback (the only post-response scope where Next flushes them). A
 * request still waiting in the queue is dropped.
 */

import type { after as nextAfter } from "next/server";
import { NextRequest } from "next/server";
import type { revalidateTag } from "next/cache";
import { persistAnalysisAfterResponse } from "@/app/api/ai/chat/[feature]/analysis-persistence";
import { createSseStreamResponse } from "@/app/api/ai/chat/[feature]/sse-stream";
import { getCachedAnalysis } from "@/lib/ai-analysis/reader.server";
import { buildAnalysisCacheTags } from "@/lib/ai-analysis/paths";
import { logChatMessage } from "@/lib/ai/openai-compatible/chat-message-logger";
import { UpstreamRequestQueue } from "@/lib/ai/openai-compatible/upstream-request-queue";
import type { persistAnalysisToDb } from "@/lib/db/mutations/ai-analysis";
import type { readLatestAnalysis } from "@/lib/db/queries/ai-analysis";
import { resolveDatabaseAccessMode } from "@/lib/db/connection";
import type { CachedAnalysis } from "@/types/ai-analysis";
import type { ChatLogContext } from "@/types/features/ai-chat";
import type { AiChatModelStreamUpdate } from "@/types/schemas/ai-openai-compatible-client";

/** In-memory stand-in for the ai_analysis_latest table. */
const analysisRows = new Map<string, CachedAnalysis<unknown>>();
/** Next runs `after()` callbacks once the response closes; this collects them. */
const afterCallbacks: Array<() => Promise<unknown>> = [];
let insideAfterCallback = false;
const tagsRevalidatedInsideAfter: string[] = [];
const tagsRevalidatedOutsideAfter: string[] = [];

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: ((task: () => Promise<unknown>) => {
    afterCallbacks.push(task);
  }) as typeof nextAfter,
}));
vi.mock("next/cache", () => ({
  cacheTag: vi.fn<() => void>(),
  cacheLife: vi.fn<() => void>(),
  revalidateTag: ((tag: string) => {
    (insideAfterCallback ? tagsRevalidatedInsideAfter : tagsRevalidatedOutsideAfter).push(tag);
  }) as typeof revalidateTag,
}));
vi.mock("@/lib/db/mutations/ai-analysis", () => ({
  persistAnalysisToDb: ((domain, entityId, analysis) => {
    analysisRows.set(`${domain}/${entityId}`, {
      metadata: { generatedAt: new Date().toISOString(), modelVersion: "v1" },
      analysis,
    });
    return Promise.resolve();
  }) as typeof persistAnalysisToDb,
}));
vi.mock("@/lib/db/queries/ai-analysis", () => ({
  readLatestAnalysis: ((domain, entityId) =>
    Promise.resolve(
      analysisRows.get(`${domain}/${entityId}`) ?? null,
    )) as typeof readLatestAnalysis,
  hasAnalysisInDb: vi.fn<() => Promise<boolean>>(),
  listAnalysisItemIdsFromDb: vi.fn<() => Promise<string[]>>(),
  listAnalysisVersionsFromDb: vi.fn<() => Promise<[]>>(),
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

async function runAfterCallbacks(): Promise<void> {
  insideAfterCallback = true;
  try {
    for (const callback of afterCallbacks.splice(0)) await callback();
  } finally {
    insideAfterCallback = false;
  }
}

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

/** Mirrors the chat route: stream the run, then persist its completion via `after()`. */
function startAnalysisRequest(args: {
  queue: UpstreamRequestQueue;
  runUpstream: (onStreamEvent?: (event: AiChatModelStreamUpdate) => void) => Promise<string>;
}) {
  const browser = new AbortController();
  // The test environment's Request drops `init.signal`; pin the browser's connection signal.
  const request = Object.defineProperty(
    new NextRequest("https://williamcallahan.com/api/ai/chat/bookmark-analysis", {
      method: "POST",
    }),
    "signal",
    { value: browser.signal },
  );
  const { response, completion } = createSseStreamResponse({
    request,
    queue: args.queue,
    priority: 0,
    startTime: Date.now(),
    logContext,
    ragContextStatus: "not_applicable",
    runUpstream: args.runUpstream,
    upstreamAbort: new AbortController(),
    finishAfterDisconnect: true,
  });
  persistAnalysisAfterResponse(
    { feature: "bookmark-analysis", entityId: "bookmark-1" },
    completion,
  );
  return { browser, response };
}

describe("AI analysis generation after client disconnect", () => {
  beforeEach(() => {
    analysisRows.clear();
    afterCallbacks.length = 0;
    tagsRevalidatedInsideAfter.length = 0;
    tagsRevalidatedOutsideAfter.length = 0;
  });

  it("makes the analysis readable and flushes its cache tags after the browser leaves mid-stream", async () => {
    const outputStarted = createGate();
    const releaseCompletion = createGate();
    const queue = new UpstreamRequestQueue({ key: "finish-after-disconnect", maxParallel: 1 });
    const { browser, response } = startAnalysisRequest({
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

    // The connection closed, so Next starts the after() callbacks while the run continues.
    const afterPhase = runAfterCallbacks();
    releaseCompletion.open();
    await afterPhase;

    const stored = await getCachedAnalysis("bookmarks", "bookmark-1");
    expect(stored?.analysis).toEqual(bookmarkAnalysis);
    expect(tagsRevalidatedInsideAfter).toEqual(
      expect.arrayContaining(buildAnalysisCacheTags("bookmarks", "bookmark-1")),
    );
    expect(tagsRevalidatedOutsideAfter).toEqual([]);
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
    const { browser } = startAnalysisRequest({ queue, runUpstream: runQueued });

    browser.abort();
    await runAfterCallbacks();
    releaseBlocker.open();
    await blocker.result;

    expect(runQueued).not.toHaveBeenCalled();
    expect(await getCachedAnalysis("bookmarks", "bookmark-1")).toBeNull();
    expect(queue.snapshot.pending).toBe(0);
  });
});
