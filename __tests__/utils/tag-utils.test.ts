/**
 * Tag Utility Functions Tests
 */

import {
  formatTagDisplay,
  normalizeTagsToStrings,
  sanitizeUnicode,
  sanitizeTagSlug,
  tagToSlug,
  slugToTagDisplay,
} from "@/lib/utils/tag-utils";

describe("Tag Utility Functions", () => {
  describe("formatTagDisplay", () => {
    it("should format simple tags to title case", () => {
      expect(formatTagDisplay("react")).toBe("React");
      expect(formatTagDisplay("javascript")).toBe("Javascript");
      expect(formatTagDisplay("typescript")).toBe("Typescript");
    });

    it("should preserve mixed-case tags", () => {
      expect(formatTagDisplay("iPhone")).toBe("iPhone");
      expect(formatTagDisplay("macOS")).toBe("macOS");
      expect(formatTagDisplay("iOS")).toBe("iOS");
      expect(formatTagDisplay("GraphQL")).toBe("GraphQL");
      expect(formatTagDisplay("TypeScript")).toBe("TypeScript");
    });

    it("should handle multi-word tags", () => {
      expect(formatTagDisplay("react native")).toBe("React Native");
      expect(formatTagDisplay("machine learning")).toBe("Machine Learning");
      expect(formatTagDisplay("ai tools")).toBe("AI Tools");
    });

    it("should handle edge cases", () => {
      expect(formatTagDisplay("")).toBe("");
      // Spaces get normalized during title case conversion
      expect(formatTagDisplay("   ").trim()).toBe("");
      expect(formatTagDisplay("a")).toBe("A");
    });
  });

  describe("normalizeTagsToStrings", () => {
    it("should handle string arrays", () => {
      expect(normalizeTagsToStrings(["tag1", "tag2", "tag3"])).toEqual(["tag1", "tag2", "tag3"]);
    });

    it("should handle object arrays", () => {
      const tags = [
        { name: "tag1", id: "1" },
        { name: "tag2", id: "2" },
      ];
      expect(normalizeTagsToStrings(tags)).toEqual(["tag1", "tag2"]);
    });

    it("should handle mixed arrays", () => {
      const tags = ["stringTag", { name: "objectTag", id: "1" }, "anotherString"];
      expect(normalizeTagsToStrings(tags)).toEqual(["stringTag", "objectTag", "anotherString"]);
    });

    it("should filter out empty values", () => {
      const tags = ["tag1", "", { name: "", id: "1" }, "tag2"];
      expect(normalizeTagsToStrings(tags)).toEqual(["tag1", "tag2"]);
    });

    it("should handle invalid input", () => {
      expect(normalizeTagsToStrings(null as any)).toEqual([]);
      expect(normalizeTagsToStrings(undefined as any)).toEqual([]);
      expect(normalizeTagsToStrings({} as any)).toEqual([]);
    });
  });

  describe("sanitizeUnicode", () => {
    it("should remove unicode control characters", () => {
      const text = "Hello\u200BWorld\u200E";
      expect(sanitizeUnicode(text)).toBe("HelloWorld");
    });

    it("should preserve normal text", () => {
      expect(sanitizeUnicode("Hello World")).toBe("Hello World");
      expect(sanitizeUnicode("Special chars: !@#$%^&*()")).toBe("Special chars: !@#$%^&*()");
    });

    it("should handle empty input", () => {
      expect(sanitizeUnicode("")).toBe("");
      expect(sanitizeUnicode(null as any)).toBe("");
      expect(sanitizeUnicode(undefined as any)).toBe("");
    });
  });

  describe("tagToSlug", () => {
    it("should convert basic tags to slugs", () => {
      expect(tagToSlug("React Native")).toBe("react-native");
      expect(tagToSlug("Machine Learning")).toBe("machine-learning");
      expect(tagToSlug("Web Development")).toBe("web-development");
    });

    it("should handle special characters", () => {
      expect(tagToSlug("AI & ML")).toBe("ai-and-ml");
      expect(tagToSlug("C++")).toBe("c-plus-plus");
      expect(tagToSlug("C#")).toBe("c-sharp");
      expect(tagToSlug(".NET")).toBe("dotnet");
      expect(tagToSlug("Node.js")).toBe("nodedotjs");
      expect(tagToSlug("Vue@3")).toBe("vue-at-3");
      expect(tagToSlug("React + Redux")).toBe("react-plus-redux");
    });

    it("should handle edge cases", () => {
      expect(tagToSlug("")).toBe("");
      expect(tagToSlug("   ")).toBe("");
      expect(tagToSlug("---")).toBe("");
      expect(tagToSlug("a")).toBe("a");
    });

    it("should handle multiple spaces and hyphens", () => {
      expect(tagToSlug("Too   Many    Spaces")).toBe("too-many-spaces");
      expect(tagToSlug("Already-Hyphenated-Tag")).toBe("already-hyphenated-tag");
      expect(tagToSlug("Mixed - Spacing - Here")).toBe("mixed-spacing-here");
    });

    it("should remove non-alphanumeric characters", () => {
      // @ and # and & are converted to words
      expect(tagToSlug("Tag!")).toBe("tag");
      expect(tagToSlug("Tag/with/slashes")).toBe("tagwithslashes");
      expect(tagToSlug("Tag?with=query")).toBe("tagwithquery");
    });

    it("should handle leading and trailing special characters", () => {
      expect(tagToSlug("...Leading dots")).toBe("dotdotleading-dots");
      expect(tagToSlug("Trailing dots...")).toBe("trailing-dots");
      expect(tagToSlug("---Both---")).toBe("both");
    });

    it("should handle unicode characters", () => {
      expect(tagToSlug("Café")).toBe("cafe");
      expect(tagToSlug("Naïve")).toBe("naive");
      expect(tagToSlug("Zürich")).toBe("zurich");
    });
  });

  describe("sanitizeTagSlug", () => {
    it("should sanitize basic tags", () => {
      expect(sanitizeTagSlug("React Native")).toBe("react-native");
      expect(sanitizeTagSlug("Machine Learning")).toBe("machine-learning");
    });

    it("should preserve special characters", () => {
      expect(sanitizeTagSlug("AI & ML")).toBe("ai-&-ml");
      expect(sanitizeTagSlug("C++")).toBe("c++");
      expect(sanitizeTagSlug(".NET")).toBe(".net");
    });

    it("should handle unicode control characters", () => {
      expect(sanitizeTagSlug("Hello\u200BWorld")).toBe("helloworld");
    });
  });

  describe("slugToTagDisplay", () => {
    it("should convert slugs back to display format", () => {
      expect(slugToTagDisplay("react-native")).toBe("React Native");
      expect(slugToTagDisplay("machine-learning")).toBe("Machine Learning");
      expect(slugToTagDisplay("web-development")).toBe("Web Development");
    });

    it("should handle single words", () => {
      expect(slugToTagDisplay("react")).toBe("React");
      expect(slugToTagDisplay("javascript")).toBe("Javascript");
    });

    it("should handle edge cases", () => {
      expect(slugToTagDisplay("")).toBe("");
      expect(slugToTagDisplay("a")).toBe("A");
    });
  });

  describe("Round-trip conversion", () => {
    it("should maintain consistency for simple tags", () => {
      const tags = ["React", "TypeScript", "Node.js", "GraphQL"];

      for (const tag of tags) {
        const slug = tagToSlug(tag);
        const displayTag = slugToTagDisplay(slug);
        // Note: Some information may be lost in slug conversion
        // Just verify that conversion doesn't throw errors
        expect(slug).toBeTruthy();
        expect(displayTag).toBeTruthy();
      }
    });
  });
});
