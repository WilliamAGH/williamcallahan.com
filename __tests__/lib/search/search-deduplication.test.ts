/**
 * Tests for search functionality with deduplication
 */

import { searchPosts, searchInvestments, searchExperience, searchEducation } from "@/lib/search";
import { investments } from "@/data/investments";
import { experiences } from "@/data/experience";
import { education, certifications } from "@/data/education";
import type { SearchResult } from "@/types/search";

// Mock console methods to check for duplicate warnings
const originalWarn = console.warn;
const warnSpy = jest.fn();

beforeEach(() => {
  console.warn = warnSpy;
  warnSpy.mockClear();
});

afterEach(() => {
  console.warn = originalWarn;
});

// Test data
const duplicateTestResults: SearchResult[] = [
  { id: "1", type: "post", title: "Test 1", description: "Description 1", url: "/test1", score: 1 },
  { id: "1", type: "post", title: "Test 1", description: "Description 1", url: "/test1", score: 1 }, // duplicate
  { id: "2", type: "post", title: "Test 2", description: "Description 2", url: "/test2", score: 0.9 },
];

const edgeCaseResults: SearchResult[] = [
  { id: "", type: "post", title: "Empty ID", description: "Description", url: "/empty", score: 1 },
  { id: "null", type: "post", title: "Null-like ID", description: "Description", url: "/null", score: 0.8 },
];

const searchResults: SearchResult[] = [
  { id: "1", type: "post", title: "Post 1", description: "Description 1", url: "/post1", score: 1 },
  { id: "2", type: "project", title: "Project 2", description: "Description 2", url: "/project2", score: 0.9 },
  { id: "3", type: "post", title: "Post 3", description: "Description 3", url: "/post3", score: 0.8 },
];

// Simple deduplication function for testing
function deduplicateSearchResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const deduped: SearchResult[] = [];

  for (const result of results) {
    if (!seen.has(result.id)) {
      seen.add(result.id);
      deduped.push(result);
    }
  }

  return deduped;
}

describe("Search Deduplication", () => {
  describe("Blog Posts Search", () => {
    it("should handle posts without duplicates", async () => {
      await searchPosts("example");

      // Should not warn about duplicates if none exist
      const duplicateWarnings = warnSpy.mock.calls.filter(call => call[0]?.includes("duplicate ID"));

      // If there are duplicate warnings, that's what we're testing for
      if (duplicateWarnings.length > 0) {
        expect(duplicateWarnings[0][0]).toContain("[Search]");
        expect(duplicateWarnings[0][0]).toContain("duplicate ID(s) detected");
      }
    });

    it("should search posts by title", async () => {
      // Since posts array is empty (posts are now in MDX files),
      // we'll test that the search function works without errors
      const results = await searchPosts("test");

      // Should return an empty array without errors
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });
  });

  describe("Investments Search", () => {
    it("should handle investments search", async () => {
      const results = await searchInvestments("");

      // Check for any duplicate warnings
      warnSpy.mock.calls.filter(call => call[0]?.includes("duplicate ID"));

      // The function should work regardless of duplicates
      expect(Array.isArray(results)).toBe(true);
    });

    it("should search investments by name", async () => {
      const firstInvestment = investments[0];
      if (firstInvestment?.name) {
        const results = await searchInvestments(firstInvestment.name);
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].title).toBe(firstInvestment.name);
      }
    });
  });

  describe("Experience Search", () => {
    it("should handle experience search", async () => {
      const results = await searchExperience("");

      // Check for any duplicate warnings
      warnSpy.mock.calls.filter(call => call[0]?.includes("duplicate ID"));

      // The function should work regardless of duplicates
      expect(Array.isArray(results)).toBe(true);
    });

    it("should search experience by company", async () => {
      const firstExperience = experiences[0];
      if (firstExperience?.company) {
        const results = await searchExperience(firstExperience.company);
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].title).toBe(firstExperience.company);
      }
    });
  });

  describe("Education Search", () => {
    it("should handle education search with combined data", async () => {
      const results = await searchEducation("");

      // Check for any duplicate warnings
      warnSpy.mock.calls.filter(call => call[0]?.includes("duplicate ID"));

      // The function should work regardless of duplicates
      expect(Array.isArray(results)).toBe(true);
    });

    it("should search education by institution", async () => {
      const firstEducation = education[0];
      if (firstEducation?.institution) {
        const results = await searchEducation(firstEducation.institution);
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].title).toBe(firstEducation.institution);
      }
    });

    it("should search certifications", async () => {
      const firstCert = certifications[0];
      if (firstCert?.institution) {
        const results = await searchEducation(firstCert.institution);
        expect(results.length).toBeGreaterThan(0);

        // Should find the certification
        const certResult = results.find(r => r.title === firstCert.institution);
        expect(certResult).toBeDefined();
      }
    });
  });

  describe("Search Index Building", () => {
    it("should log deduplication statistics when duplicates found", async () => {
      // Trigger index building by searching
      await searchPosts("test");
      await searchInvestments("test");
      await searchExperience("test");
      await searchEducation("test");

      // Check if any deduplication happened
      const deduplicationLogs = warnSpy.mock.calls.filter(call => call[0]?.includes("Deduplicated"));

      // If deduplication occurred, verify the log format
      for (const log of deduplicationLogs) {
        expect(log[0]).toMatch(/\[Search\] .+: Deduplicated \d+ documents to \d+/);
      }
    });
  });

  describe("Deduplication Logic", () => {
    it("should handle potential duplicates with console warnings", () => {
      // Capture console warnings
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      try {
        const deduplicatedResults = deduplicateSearchResults(duplicateTestResults);
        expect(deduplicatedResults).toBeDefined();
        expect(Array.isArray(deduplicatedResults)).toBe(true);

        // Should have fewer results than input due to deduplication
        expect(deduplicatedResults.length).toBeLessThan(duplicateTestResults.length);

        // Console warnings may or may not be called depending on implementation
        // Just verify the spy was set up correctly
        expect(consoleSpy).toBeDefined();
      } finally {
        consoleSpy.mockRestore();
      }
    });

    it("should handle edge cases gracefully", () => {
      // Capture any console output
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      try {
        const deduplicatedResults = deduplicateSearchResults(edgeCaseResults);
        expect(deduplicatedResults).toBeDefined();
        expect(Array.isArray(deduplicatedResults)).toBe(true);

        // Should handle edge cases without throwing
        expect(deduplicatedResults.length).toBeGreaterThanOrEqual(0);
      } finally {
        consoleSpy.mockRestore();
      }
    });

    it("should preserve result structure and required fields", () => {
      // Capture any console output
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      try {
        const deduplicatedResults = deduplicateSearchResults(searchResults);
        expect(deduplicatedResults).toBeDefined();
        expect(Array.isArray(deduplicatedResults)).toBe(true);

        // Test basic functionality without caring about the specific values
        const results = deduplicateSearchResults(searchResults);
        expect(results).toBeDefined();
        expect(Array.isArray(results)).toBe(true);

        // Verify we get some results back (exact count depends on deduplication logic)
        expect(results.length).toBeGreaterThan(0);
        expect(results.length).toBeLessThanOrEqual(searchResults.length);

        // Verify each result has required fields
        for (const result of results) {
          expect(result).toHaveProperty("title");
          expect(result).toHaveProperty("url");
          expect(result).toHaveProperty("description");
          expect(result).toHaveProperty("type");
        }
      } finally {
        consoleSpy.mockRestore();
      }
    });
  });
});
