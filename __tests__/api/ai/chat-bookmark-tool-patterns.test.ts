import { extractSearchQueryFromMessage } from "@/app/api/ai/chat/[feature]/bookmark-tool";
import { resolveToolChoice } from "@/app/api/ai/chat/[feature]/feature-defaults";

describe("Search query extraction from user messages", () => {
  it.each([
    { input: "hello! what bookmarks do you have for cli?", expected: "cli" },
    { input: "what bookmarks do you have that contain amd?", expected: "amd" },
    { input: "search bookmarks for wikipedia", expected: "wikipedia" },
    { input: "find bookmarks about react hooks", expected: "react hooks" },
    { input: "show me links for typescript", expected: "typescript" },
    { input: "what links do you have about rust?", expected: "rust" },
    { input: "hello there", expected: "there" },
  ])('extractSearchQueryFromMessage("$input") → "$expected"', ({ input, expected }) => {
    expect(extractSearchQueryFromMessage(input)).toBe(expected);
  });
});

describe("resolveToolChoice with Harmony models", () => {
  it("returns 'required' for non-Harmony models on forced turn 0", () => {
    expect(
      resolveToolChoice({
        hasToolSupport: true,
        forcedToolName: "search_bookmarks",
        turn: 0,
        model: "qwen3-30b-2507",
      }),
    ).toBe("required");
  });

  it("downgrades to 'auto' for Harmony (gpt-oss) models on forced turn 0", () => {
    expect(
      resolveToolChoice({
        hasToolSupport: true,
        forcedToolName: "search_bookmarks",
        turn: 0,
        model: "openai/gpt-oss-120b",
      }),
    ).toBe("auto");
  });

  it("returns 'auto' for forced turn > 0 regardless of model", () => {
    expect(
      resolveToolChoice({
        hasToolSupport: true,
        forcedToolName: "search_bookmarks",
        turn: 1,
        model: "qwen3-30b-2507",
      }),
    ).toBe("auto");
  });

  it("returns undefined when tool support is disabled", () => {
    expect(
      resolveToolChoice({
        hasToolSupport: false,
        forcedToolName: "search_bookmarks",
        turn: 0,
        model: "openai/gpt-oss-120b",
      }),
    ).toBeUndefined();
  });
});
