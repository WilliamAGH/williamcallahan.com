/**
 * Tests for AI chat RAG helper behavior.
 * Ensures retrieval query construction and inventory gating are deterministic.
 */

import { buildRagContextForChat } from "@/app/api/ai/chat/[feature]/chat-helpers";
import { isAbortError } from "@/app/api/ai/chat/[feature]/upstream-error";
import { buildContextForQuery } from "@/lib/ai/rag";

vi.mock("@/lib/ai/rag", () => ({
  buildContextForQuery: vi.fn().mockResolvedValue({
    contextText: "mocked context",
    tokenEstimate: 100,
    searchResultCount: 1,
    searchDurationMs: 5,
    retrievalStatus: "success",
  }),
}));

const mockedBuildContextForQuery = vi.mocked(buildContextForQuery);
const conversationId = "77777777-7777-4777-8777-777777777777";

describe("AI Chat RAG Helpers", () => {
  beforeEach(() => {
    mockedBuildContextForQuery.mockClear();
  });

  it("expands anaphoric follow-up queries using previous user context", async () => {
    await buildRagContextForChat("terminal_chat", {
      conversationId,
      priority: 10,
      messages: [
        { role: "user", content: "search bookmarks about wikipedia signs of ai writing" },
        { role: "assistant", content: "Found one bookmark." },
        { role: "user", content: "i want you to search for them" },
      ],
    });

    expect(mockedBuildContextForQuery).toHaveBeenCalledWith(
      "search bookmarks about wikipedia signs of ai writing i want you to search for them",
      expect.objectContaining({
        includeInventory: false,
        isPaginationRequest: false,
      }),
    );
  });

  it("keeps explicit search queries unchanged", async () => {
    await buildRagContextForChat("terminal_chat", {
      conversationId,
      priority: 10,
      messages: [{ role: "user", content: "search bookmarks for wikipedia" }],
    });

    expect(mockedBuildContextForQuery).toHaveBeenCalledWith(
      "search bookmarks for wikipedia",
      expect.objectContaining({
        includeInventory: false,
      }),
    );
  });

  it("enables inventory for list-style requests", async () => {
    await buildRagContextForChat("terminal_chat", {
      conversationId,
      priority: 10,
      messages: [{ role: "user", content: "list all bookmarks" }],
    });

    expect(mockedBuildContextForQuery).toHaveBeenCalledWith(
      "list all bookmarks",
      expect.objectContaining({
        includeInventory: true,
      }),
    );
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
