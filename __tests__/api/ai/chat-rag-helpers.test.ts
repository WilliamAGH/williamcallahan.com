/**
 * Tests for AI chat RAG helper behavior.
 * Ensures retrieval query construction and inventory gating are deterministic.
 */

import { NextRequest, NextResponse } from "next/server";
import { buildRagContextForChat, validateRequest } from "@/app/api/ai/chat/[feature]/chat-helpers";
import { isAbortError } from "@/app/api/ai/chat/[feature]/upstream-error";
import { buildContextForQuery } from "@/lib/ai/rag";
import { memoryPressureMiddleware } from "@/lib/middleware/memory-pressure";

vi.mock("@/lib/ai/rag", () => ({
  buildContextForQuery: vi.fn().mockImplementation((query: string) =>
    Promise.resolve({
      contextText: query,
      tokenEstimate: 100,
      searchResultCount: 1,
      searchDurationMs: 5,
      retrievalStatus: "success",
    }),
  ),
}));
vi.mock("@/lib/middleware/memory-pressure", () => ({
  memoryPressureMiddleware: vi.fn().mockResolvedValue(null),
}));

const mockedBuildContextForQuery = vi.mocked(buildContextForQuery);
const mockedMemoryPressureMiddleware = vi.mocked(memoryPressureMiddleware);
const conversationId = "77777777-7777-4777-8777-777777777777";

describe("AI Chat RAG Helpers", () => {
  beforeEach(() => {
    mockedBuildContextForQuery.mockClear();
  });

  it("expands anaphoric follow-up queries using previous user context", async () => {
    const result = await buildRagContextForChat("terminal_chat", {
      conversationId,
      priority: 10,
      messages: [
        { role: "user", content: "search bookmarks about wikipedia signs of ai writing" },
        { role: "assistant", content: "Found one bookmark." },
        { role: "user", content: "i want you to search for them" },
      ],
    });

    expect(result.augmentedPrompt).toBe(
      "search bookmarks about wikipedia signs of ai writing i want you to search for them",
    );
    expect(result.status).toBe("included");
  });

  it("keeps explicit search queries unchanged", async () => {
    const result = await buildRagContextForChat("terminal_chat", {
      conversationId,
      priority: 10,
      messages: [{ role: "user", content: "search bookmarks for wikipedia" }],
    });

    expect(result.augmentedPrompt).toBe("search bookmarks for wikipedia");
    expect(result.status).toBe("included");
  });

  it("enables inventory for list-style requests", async () => {
    const result = await buildRagContextForChat("terminal_chat", {
      conversationId,
      priority: 10,
      messages: [{ role: "user", content: "list all bookmarks" }],
    });

    expect(result.augmentedPrompt).toBe("list all bookmarks");
    expect(result.status).toBe("included");
  });

  afterAll(() => {
    vi.doUnmock("@/lib/ai/rag");
    vi.doUnmock("@/lib/middleware/memory-pressure");
    vi.resetModules();
  });
});

describe("AI Chat Request Validation", () => {
  beforeEach(() => {
    mockedMemoryPressureMiddleware.mockReset();
    mockedMemoryPressureMiddleware.mockResolvedValue(null);
  });

  it("returns memory-shed response before further validation when pressure is critical", async () => {
    const memoryResponse = NextResponse.json(
      { code: "SERVICE_UNAVAILABLE", message: "System is under heavy load." },
      { status: 503 },
    );
    mockedMemoryPressureMiddleware.mockResolvedValueOnce(memoryResponse);

    const request = new NextRequest("https://williamcallahan.com/api/ai/chat/terminal_chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userText: "hello there" }),
    });

    const result = await validateRequest(request, "terminal_chat");

    expect(mockedMemoryPressureMiddleware).toHaveBeenCalledWith(request);
    expect(result).toBe(memoryResponse);
  });

  it("rejects non-SSE requests and preserves warning status header", async () => {
    const memoryWarningResponse = NextResponse.next();
    memoryWarningResponse.headers.set("X-System-Status", "MEMORY_WARNING");
    mockedMemoryPressureMiddleware.mockResolvedValueOnce(memoryWarningResponse);

    const request = new NextRequest("https://williamcallahan.com/api/ai/chat/terminal_chat", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ userText: "hello there" }),
    });

    const result = await validateRequest(request, "terminal_chat");

    expect(result).toBeInstanceOf(NextResponse);
    expect(result.status).toBe(406);
    expect(result.headers.get("X-System-Status")).toBe("MEMORY_WARNING");
  });
});

describe("AI Chat Abort Detection", () => {
  it("detects DOMException AbortError instances", () => {
    expect(isAbortError(new DOMException("Request aborted", "AbortError"))).toBe(true);
  });

  it("does not classify generic errors as abort errors", () => {
    expect(isAbortError(new Error("Boom"))).toBe(false);
  });
});
