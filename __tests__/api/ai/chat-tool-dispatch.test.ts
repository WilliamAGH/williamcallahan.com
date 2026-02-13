import { extractToolCallsFromResponseOutput } from "@/app/api/ai/chat/[feature]/tool-dispatch";

describe("AI Chat Tool Dispatch (tool-dispatch)", () => {
  it("returns an empty array when output has no function_call items", () => {
    const output: unknown[] = [{ type: "message" }];
    const calls = extractToolCallsFromResponseOutput(output);
    expect(calls).toEqual([]);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("extracts valid tool calls and logs drop counts for invalid/unknown calls", () => {
    const output: unknown[] = [
      { type: "function_call", call_id: "bad-1", name: "search_bookmarks" },
      {
        type: "function_call",
        call_id: "unknown-1",
        name: "search_not_registered",
        arguments: { query: "x" },
      },
      {
        type: "function_call",
        call_id: "ok-1",
        name: "search_bookmarks",
        arguments: { query: "wikipedia", maxResults: 5 },
      },
    ];

    const calls = extractToolCallsFromResponseOutput(output);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.call_id).toBe("ok-1");
    expect(calls[0]?.name).toBe("search_bookmarks");
    expect(typeof calls[0]?.arguments).toBe("string");
    expect(calls[0]?.arguments).toBe(JSON.stringify({ query: "wikipedia", maxResults: 5 }));

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("[WARN] [AI Chat] Dropped responses function_call items"),
      expect.objectContaining({
        totalOutputItems: 3,
        functionCallItems: 3,
        acceptedFunctionCalls: 1,
        droppedInvalidSchema: 1,
        droppedUnknownTool: 1,
      }),
    );
  });
});
