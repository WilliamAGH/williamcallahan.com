/**
 * Tests for AI chat RAG helper behavior.
 * Ensures retrieval query construction and inventory gating are deterministic.
 */

import { NextRequest } from "next/server";
import { POST as persistAiAnalysis } from "@/app/api/ai/analysis/[domain]/[id]/route";
import { buildRagContextForChat, validateRequest } from "@/app/api/ai/chat/[feature]/chat-helpers";
import { isAbortError } from "@/app/api/ai/chat/[feature]/upstream-error";
import { persistAnalysis as writeAnalysis } from "@/lib/ai-analysis/writer.server";
import { buildContextForQuery } from "@/lib/ai/rag";
import { isOperationAllowed } from "@/lib/rate-limiter";

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
vi.mock("@/lib/rate-limiter", () => ({
  isOperationAllowed: vi.fn().mockReturnValue(true),
}));
vi.mock("@/lib/ai-analysis/writer.server", () => ({
  persistAnalysis: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/utils/env-logger", () => ({
  envLogger: {
    log: vi.fn(),
  },
}));
const mockedBuildContextForQuery = vi.mocked(buildContextForQuery);
const mockedWriteAnalysis = vi.mocked(writeAnalysis);
const mockedIsOperationAllowed = vi.mocked(isOperationAllowed);
const conversationId = "77777777-7777-4777-8777-777777777777";
const bookmarkAnalysis = {
  summary: "Useful technical resource for practical implementation decisions.",
  category: "Technology",
  highlights: ["Explains the implementation tradeoffs clearly."],
  contextualDetails: {
    primaryDomain: "Programming",
    format: "Article",
    accessMethod: "Free",
  },
  relatedResources: ["Related implementation reference"],
  targetAudience: "Developers",
};

function buildAnalysisPersistRequest(origin: string): NextRequest {
  return Object.assign(
    new NextRequest("https://williamcallahan.com/api/ai/analysis/bookmarks/bookmark-1", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
      },
    }),
    {
      json: () => Promise.resolve({ analysis: bookmarkAnalysis }),
    },
  );
}

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
    vi.resetModules();
  });
});

describe("AI Chat Request Validation", () => {
  it("rejects non-SSE requests without system-status headers", async () => {
    const request = new NextRequest("https://williamcallahan.com/api/ai/chat/terminal_chat", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ userText: "hello there" }),
    });

    const result = await validateRequest(request, "terminal_chat");

    expect(result).toBeDefined();
    expect(result.status).toBe(406);
    expect(result.headers.get("X-System-Status")).toBeFalsy();
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

describe("AI Analysis Persistence Route", () => {
  beforeEach(() => {
    mockedWriteAnalysis.mockClear();
    mockedIsOperationAllowed.mockClear();
    mockedIsOperationAllowed.mockReturnValue(true);
  });

  it("rejects cross-origin persistence before rate limiting or writing", async () => {
    const request = buildAnalysisPersistRequest("https://attacker.example");

    const response = await persistAiAnalysis(request, {
      params: Promise.resolve({ domain: "bookmarks", id: "bookmark-1" }),
    });

    expect(response.status).toBe(403);
    expect(mockedIsOperationAllowed).not.toHaveBeenCalled();
    expect(mockedWriteAnalysis).not.toHaveBeenCalled();
  });

  it("persists valid same-origin analysis", async () => {
    const request = buildAnalysisPersistRequest("https://williamcallahan.com");

    const response = await persistAiAnalysis(request, {
      params: Promise.resolve({ domain: "bookmarks", id: "bookmark-1" }),
    });

    expect(response.status).toBe(200);
    expect(mockedWriteAnalysis).toHaveBeenCalledWith(
      "bookmarks",
      "bookmark-1",
      expect.objectContaining({ summary: bookmarkAnalysis.summary }),
      { modelVersion: undefined },
    );
  });
});
