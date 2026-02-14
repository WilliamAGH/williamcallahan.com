import { getForcedToolName, getToolByName } from "@/app/api/ai/chat/[feature]/tool-registry";

describe("AI Chat Tool Registry (tool-registry)", () => {
  describe("getToolByName", () => {
    it("returns a registration for a known tool name", () => {
      const registration = getToolByName("search_bookmarks");
      expect(registration?.name).toBe("search_bookmarks");
    });

    it("returns undefined for unknown tool names", () => {
      expect(getToolByName("search_not_registered")).toBeUndefined();
    });
  });

  describe("getForcedToolName", () => {
    it("returns undefined when message is missing", () => {
      expect(getForcedToolName(undefined)).toBeUndefined();
    });

    it.each([
      {
        label: "projects scope",
        message: "What projects has William built?",
        expected: "search_projects",
      },
      {
        label: "experience scope",
        message: "Tell me about your work experience",
        expected: "search_experience",
      },
      {
        label: "books scope",
        message: "Show me your reading list",
        expected: "search_books",
      },
      {
        label: "blog scope",
        message: "Show me blog posts",
        expected: "search_blog",
      },
      {
        label: "tags scope",
        message: "What topics does William cover?",
        expected: "search_tags",
      },
      {
        label: "analysis scope",
        message: "Show me ai generated analysis",
        expected: "search_analysis",
      },
      {
        label: "thoughts scope",
        message: "Share your thoughts",
        expected: "search_thoughts",
      },
    ])("detects $label", ({ message, expected }) => {
      expect(getForcedToolName(message)).toBe(expected);
    });

    it.each([
      { message: "tools", label: "tools" },
      { message: "read", label: "read" },
      { message: "position", label: "position" },
    ])("avoids false positives for $label", ({ message }) => {
      expect(getForcedToolName(message)).toBeUndefined();
    });
  });
});
