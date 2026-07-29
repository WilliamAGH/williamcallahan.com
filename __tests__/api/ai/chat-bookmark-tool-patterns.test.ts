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

describe("resolveToolChoice", () => {
  it("returns 'required' for a forced tool on turn 0", () => {
    expect(
      resolveToolChoice({
        hasToolSupport: true,
        forcedToolName: "search_bookmarks",
        turn: 0,
      }),
    ).toBe("required");
  });

  it("returns 'auto' for a forced tool after turn 0", () => {
    expect(
      resolveToolChoice({
        hasToolSupport: true,
        forcedToolName: "search_bookmarks",
        turn: 1,
      }),
    ).toBe("auto");
  });

  it("returns undefined when tool support is disabled", () => {
    expect(
      resolveToolChoice({
        hasToolSupport: false,
        forcedToolName: "search_bookmarks",
        turn: 0,
      }),
    ).toBeUndefined();
  });
});
