import { stripHarmonyTokens } from "@/lib/ai/openai-compatible/harmony-sanitizer";

describe("stripHarmonyTokens", () => {
  it.each([
    ['<|channel|>to=functions.search_tags<|message|>{"query":"work","maxResults":5}', ""],
    ["Here is visible content<|channel|>leaked control tokens", "Here is visible content"],
    ["plain text with no tokens", "plain text with no tokens"],
    ["", ""],
  ])("removes only the channel-control suffix from %j", (input, expected) => {
    expect(stripHarmonyTokens(input)).toBe(expected);
  });

  it("preserves other control-like text", () => {
    expect(stripHarmonyTokens("text<|end_of_turn|>more")).toBe("text<|end_of_turn|>more");
    expect(stripHarmonyTokens("text<|im_start|>system")).toBe("text<|im_start|>system");
  });
});
