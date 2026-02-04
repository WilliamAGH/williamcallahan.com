/**
 * Tests for RAG Static Context Module
 *
 * Verifies that static context is correctly extracted from CV data,
 * metadata, and projects.
 */

import { getStaticContext, formatStaticContext } from "@/lib/ai/rag/static-context";

describe("RAG Static Context", () => {
  describe("getStaticContext", () => {
    it("returns context with required fields", () => {
      const ctx = getStaticContext();

      expect(ctx).toHaveProperty("biography");
      expect(ctx).toHaveProperty("qualifications");
      expect(ctx).toHaveProperty("technicalFocus");
      expect(ctx).toHaveProperty("currentProjects");
      expect(ctx).toHaveProperty("socialLinks");
    });

    it("biography contains professional summary", () => {
      const ctx = getStaticContext();

      expect(ctx.biography).toContain("engineer");
      expect(ctx.biography.length).toBeGreaterThan(50);
    });

    it("qualifications includes CFA and CFP", () => {
      const ctx = getStaticContext();

      const qualText = ctx.qualifications.join(" ");
      expect(qualText).toMatch(/CFA/i);
      expect(qualText).toMatch(/CFP/i);
    });

    it("technicalFocus has multiple areas", () => {
      const ctx = getStaticContext();

      expect(ctx.technicalFocus.length).toBeGreaterThan(0);
      expect(ctx.technicalFocus[0]).toHaveProperty("area");
      expect(ctx.technicalFocus[0]).toHaveProperty("skills");
    });

    it("currentProjects includes featured projects", () => {
      const ctx = getStaticContext();

      expect(ctx.currentProjects.length).toBeGreaterThan(0);

      // All featured projects should have name, description, url
      for (const project of ctx.currentProjects) {
        expect(project.name).toBeTruthy();
        expect(project.description).toBeTruthy();
        expect(project.url).toBeTruthy();
      }
    });

    it("socialLinks includes GitHub", () => {
      const ctx = getStaticContext();

      const platforms = ctx.socialLinks.map((l) => l.platform.toLowerCase());
      expect(platforms).toContain("github");
    });

    it("returns same instance on subsequent calls (caching)", () => {
      const ctx1 = getStaticContext();
      const ctx2 = getStaticContext();

      expect(ctx1).toBe(ctx2);
    });
  });

  describe("formatStaticContext", () => {
    it("formats context as readable text", () => {
      const ctx = getStaticContext();
      const formatted = formatStaticContext(ctx);

      expect(formatted).toContain("ABOUT WILLIAM CALLAHAN");
      expect(formatted).toContain("Qualifications:");
      expect(formatted).toContain("Technical Focus:");
      expect(formatted).toContain("Current Projects:");
    });

    it("includes project URLs in output", () => {
      const ctx = getStaticContext();
      const formatted = formatStaticContext(ctx);

      expect(formatted).toContain("URL:");
    });

    it("produces multi-line output", () => {
      const ctx = getStaticContext();
      const formatted = formatStaticContext(ctx);
      const lineCount = formatted.split("\n").length;

      expect(lineCount).toBeGreaterThan(10);
    });
  });
});
