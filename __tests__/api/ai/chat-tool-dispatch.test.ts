import {
  dispatchResponseToolCallsByName,
  extractToolCallsFromResponseOutput,
} from "@/app/api/ai/chat/[feature]/tool-dispatch";

describe("AI Chat Tool Dispatch (tool-dispatch)", () => {
  it("returns an empty array when output has no function_call items", () => {
    const output: unknown[] = [{ type: "message" }];
    const calls = extractToolCallsFromResponseOutput(output);
    expect(calls).toEqual([]);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("extracts schema-valid tool calls and logs drop counts for invalid calls", () => {
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

    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.call_id)).toEqual(["unknown-1", "ok-1"]);
    expect(calls[1]?.name).toBe("search_bookmarks");
    expect(typeof calls[1]?.arguments).toBe("string");
    expect(calls[1]?.arguments).toBe(JSON.stringify({ query: "wikipedia", maxResults: 5 }));

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("[WARN] [AI Chat] Dropped responses function_call items"),
      expect.objectContaining({
        totalOutputItems: 3,
        functionCallItems: 3,
        acceptedFunctionCalls: 2,
        droppedInvalidSchema: 1,
      }),
    );
  });

  it("returns function_call_output errors for unknown Responses API tools", async () => {
    const dispatch = await dispatchResponseToolCallsByName([
      {
        type: "function_call",
        call_id: "unknown-1",
        name: "search_not_registered",
        arguments: JSON.stringify({ query: "wikipedia" }),
      },
    ]);

    expect(dispatch.outputs).toEqual([
      {
        type: "function_call_output",
        call_id: "unknown-1",
        output: JSON.stringify({
          query: "",
          results: [],
          totalResults: 0,
          error: 'Unknown tool "search_not_registered"',
        }),
      },
    ]);
    expect(dispatch.failedCallIds).toEqual(["unknown-1"]);
  });
});
