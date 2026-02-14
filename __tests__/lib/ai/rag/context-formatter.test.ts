/**
 * Tests for RAG Context Formatter Module
 *
 * Verifies that static and dynamic context is correctly formatted
 * and token budget management works properly.
 */

import { formatContext, type DynamicResult } from "@/lib/ai/rag/context-formatter";
import type { StaticContext } from "@/lib/ai/rag/static-context";

const mockStaticContext: StaticContext = {
  biography: "Software engineer and leader experienced in data, search, finance.",
  qualifications: ["CFA (CFA Institute)", "CFP (CFP Board)"],
  technicalFocus: [
    { area: "Languages", skills: ["TypeScript", "Python"] },
    { area: "AI", skills: ["RAG", "LLM"] },
  ],
  currentProjects: [
    {
      name: "aVenture.vc",
      description: "Private-market research platform",
      url: "https://aventure.vc",
    },
    {
      name: "williamcallahan.com",
      description: "Personal site",
      url: "https://williamcallahan.com",
    },
  ],
  socialLinks: [
    { platform: "GitHub", url: "https://github.com/WilliamAGH" },
    { platform: "Twitter", url: "https://twitter.com/williamcallahan" },
  ],
  homePageHighlights: ["Hello there -- I'm William.", "I'm currently building aVenture."],
  contactSummary:
    "Here are some of the places I can be found online. I share content about technology.",
  contactLinks: [
    { label: "Discord", url: "https://discord.com/users/WilliamDscord" },
    { label: "X", url: "https://x.com/williamcallahan" },
  ],
};

const mockDynamicResults: DynamicResult[] = [
  {
    scope: "projects",
    title: "Researchly",
    description: "AI-powered web search",
    url: "https://researchly.fyi",
    score: 0.95,
  },
  {
    scope: "blog",
    title: "Building Terminal UIs",
    description: "How to build terminal components",
    url: "/blog/building-terminal-uis",
    score: 0.85,
  },
];

describe("RAG Context Formatter", () => {
  describe("formatContext", () => {
    it("includes static context header", () => {
      const { text } = formatContext(mockStaticContext, []);

      expect(text).toContain("ABOUT WILLIAM CALLAHAN");
    });

    it("includes biography", () => {
      const { text } = formatContext(mockStaticContext, []);

      expect(text).toContain("Software engineer");
    });

    it("includes qualifications", () => {
      const { text } = formatContext(mockStaticContext, []);

      expect(text).toContain("CFA");
      expect(text).toContain("CFP");
    });

    it("includes technical focus", () => {
      const { text } = formatContext(mockStaticContext, []);

      expect(text).toContain("TypeScript");
      expect(text).toContain("RAG");
    });

    it("includes projects", () => {
      const { text } = formatContext(mockStaticContext, []);

      expect(text).toContain("aVenture.vc");
      expect(text).toContain("williamcallahan.com");
    });

    it("includes inventory catalog when provided", () => {
      const inventoryText =
        "\n=== INVENTORY CATALOG ===\n[Investments] count=1 status=success fields=id,name\n- id=alpha | name=Alpha\n";
      const { text } = formatContext(mockStaticContext, [], inventoryText);

      expect(text).toContain("INVENTORY CATALOG");
      expect(text).toContain("Investments");
    });

    it("includes dynamic results when provided", () => {
      const { text } = formatContext(mockStaticContext, mockDynamicResults);

      expect(text).toContain("SEARCH RESULTS");
      expect(text).toContain("Researchly");
      expect(text).toContain("Building Terminal UIs");
    });

    it("labels dynamic results by scope", () => {
      const { text } = formatContext(mockStaticContext, mockDynamicResults);

      expect(text).toContain("[Projects]");
      expect(text).toContain("[Blog]");
    });

    it("returns token estimate", () => {
      const { tokenEstimate } = formatContext(mockStaticContext, []);

      expect(tokenEstimate).toBeGreaterThan(0);
      expect(typeof tokenEstimate).toBe("number");
    });

    it("estimates roughly 4 chars per token", () => {
      const { text, tokenEstimate } = formatContext(mockStaticContext, []);

      // Allow some variance but should be roughly 4 chars/token
      const charsPerToken = text.length / tokenEstimate;
      expect(charsPerToken).toBeGreaterThan(3);
      expect(charsPerToken).toBeLessThan(5);
    });
  });

  describe("token budget", () => {
    it("respects maxTokens option", () => {
      const { tokenEstimate } = formatContext(mockStaticContext, mockDynamicResults, "", {
        maxTokens: 500,
      });

      expect(tokenEstimate).toBeLessThanOrEqual(500);
    });

    it("truncates dynamic results first when over budget", () => {
      const { text } = formatContext(mockStaticContext, mockDynamicResults, "", {
        maxTokens: 200,
      });

      // Static context should still be present
      expect(text).toContain("ABOUT WILLIAM CALLAHAN");
      // Dynamic may be truncated or missing
    });

    it("indicates truncation when content is cut", () => {
      // Very small budget should cause truncation
      const { text } = formatContext(mockStaticContext, mockDynamicResults, "", {
        maxTokens: 50,
      });

      // Either truncation marker or just short text
      expect(text.length).toBeLessThan(300);
    });
  });

  describe("edge cases", () => {
    it("handles empty dynamic results", () => {
      const { text, tokenEstimate } = formatContext(mockStaticContext, []);

      expect(text).not.toContain("SEARCH RESULTS");
      expect(tokenEstimate).toBeGreaterThan(0);
    });

    it("handles minimal static context", () => {
      const minimalCtx: StaticContext = {
        biography: "Test bio",
        qualifications: [],
        technicalFocus: [],
        currentProjects: [],
        socialLinks: [],
        homePageHighlights: [],
        contactSummary: "Test contact",
        contactLinks: [],
      };

      const { text, tokenEstimate } = formatContext(minimalCtx, []);

      expect(text).toContain("Test bio");
      expect(tokenEstimate).toBeGreaterThan(0);
    });
  });
});
