import {
  matchesBookmarkSearchPattern,
  extractSearchQueryFromMessage,
} from "@/app/api/ai/chat/[feature]/bookmark-tool";
import { resolveToolChoice } from "@/app/api/ai/chat/[feature]/feature-defaults";

describe("Bookmark tool pattern matching", () => {
  it.each([
    { input: "search bookmarks for wikipedia", expected: true },
    { input: "find links about AI", expected: true },
    { input: "show me saved resources", expected: true },
    { input: "what bookmarks do you have for cli?", expected: true },
    { input: "what bookmarks do you have that contain amd?", expected: true },
    { input: "bookmarks containing react hooks", expected: true },
    { input: "any bookmarks with typescript?", expected: true },
    { input: "bookmarks matching kubernetes", expected: true },
    { input: "what links do you have about rust?", expected: true },
    { input: "what bookmarks do you have?", expected: true },
    { input: "hello there", expected: false },
    { input: "what is a bookmark?", expected: false },
    { input: undefined, expected: false },
    { input: "show me your resume", expected: false },
    { input: "find the meaning of life", expected: false },
    { input: "search for a good recipe", expected: false },
    { input: "show me the weather", expected: false },
  ])('matchesBookmarkSearchPattern("$input") → $expected', ({ input, expected }) => {
    expect(matchesBookmarkSearchPattern(input)).toBe(expected);
  });
});

describe("Search query extraction from user messages", () => {
  it.each([
    { input: "hello! what bookmarks do you have for cli?", expected: "cli" },
    { input: "what bookmarks do you have that contain amd?", expected: "amd" },
    { input: "search bookmarks for wikipedia", expected: "wikipedia" },
    { input: "find bookmarks about react hooks", expected: "react hooks" },
    { input: "show me links for typescript", expected: "links typescript" },
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
