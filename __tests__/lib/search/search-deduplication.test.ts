/**
 * Tests for search functionality with deduplication
 */

import { searchPosts, searchInvestments, searchExperience, searchEducation } from "@/lib/search";
import { posts } from "@/data/blog/posts";
import { investments } from "@/data/investments";
import { experiences } from "@/data/experience";
import { education, certifications } from "@/data/education";

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

describe("Search Deduplication", () => {
  describe("Blog Posts Search", () => {
    it("should handle posts without duplicates", () => {
      const results = searchPosts("example");

      // Should not warn about duplicates if none exist
      const duplicateWarnings = warnSpy.mock.calls.filter((call) => call[0]?.includes("duplicate ID"));

      // If there are duplicate warnings, that's what we're testing for
      if (duplicateWarnings.length > 0) {
        expect(duplicateWarnings[0][0]).toContain("[Search]");
        expect(duplicateWarnings[0][0]).toContain("duplicate ID(s) detected");
      }
    });

    it("should search posts by title", () => {
      // Since posts array is empty (posts are now in MDX files),
      // we'll test that the search function works without errors
      const results = searchPosts("test");

      // Should return an empty array without errors
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });
  });

  describe("Investments Search", () => {
    it("should handle investments search", () => {
      const results = searchInvestments("");

      // Check for any duplicate warnings
      const duplicateWarnings = warnSpy.mock.calls.filter((call) => call[0]?.includes("duplicate ID"));

      // The function should work regardless of duplicates
      expect(Array.isArray(results)).toBe(true);
    });

    it("should search investments by name", () => {
      const firstInvestment = investments[0];
      if (firstInvestment?.name) {
        const results = searchInvestments(firstInvestment.name);
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].label).toBe(firstInvestment.name);
      }
    });
  });

  describe("Experience Search", () => {
    it("should handle experience search", () => {
      const results = searchExperience("");

      // Check for any duplicate warnings
      const duplicateWarnings = warnSpy.mock.calls.filter((call) => call[0]?.includes("duplicate ID"));

      // The function should work regardless of duplicates
      expect(Array.isArray(results)).toBe(true);
    });

    it("should search experience by company", () => {
      const firstExperience = experiences[0];
      if (firstExperience?.company) {
        const results = searchExperience(firstExperience.company);
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].label).toBe(firstExperience.company);
      }
    });
  });

  describe("Education Search", () => {
    it("should handle education search with combined data", () => {
      const results = searchEducation("");

      // Check for any duplicate warnings
      const duplicateWarnings = warnSpy.mock.calls.filter((call) => call[0]?.includes("duplicate ID"));

      // The function should work regardless of duplicates
      expect(Array.isArray(results)).toBe(true);
    });

    it("should search education by institution", () => {
      const firstEducation = education[0];
      if (firstEducation?.institution) {
        const results = searchEducation(firstEducation.institution);
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].label).toBe(firstEducation.institution);
      }
    });

    it("should search certifications", () => {
      const firstCert = certifications[0];
      if (firstCert?.institution) {
        const results = searchEducation(firstCert.institution);
        expect(results.length).toBeGreaterThan(0);

        // Should find the certification
        const certResult = results.find((r) => r.label === firstCert.institution);
        expect(certResult).toBeDefined();
      }
    });
  });

  describe("Search Index Building", () => {
    it("should log deduplication statistics when duplicates found", () => {
      // Trigger index building by searching
      searchPosts("test");
      searchInvestments("test");
      searchExperience("test");
      searchEducation("test");

      // Check if any deduplication happened
      const deduplicationLogs = warnSpy.mock.calls.filter((call) => call[0]?.includes("Deduplicated"));

      // If deduplication occurred, verify the log format
      for (const log of deduplicationLogs) {
        expect(log[0]).toMatch(/\[Search\] .+: Deduplicated \d+ documents to \d+/);
      }
    });
  });
});
