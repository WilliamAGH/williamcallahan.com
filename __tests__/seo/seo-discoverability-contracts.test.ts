/**
 * Search-engine discoverability boundary contracts.
 * @vitest-environment node
 */

import { NextRequest } from "next/server.js";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import robots from "@/app/robots";
import { metadata as rootMetadata } from "@/app/layout";
import { metadata as homeMetadata } from "@/app/page";
import { generateSchemaGraph } from "@/lib/seo/schema";

vi.mock("next/server", async () => import("next/server.js"));
vi.mock("@sentry/nextjs/config", () => ({
  withSentryConfig: <T>(config: T): T => config,
}));

describe("Search-engine discoverability contracts", () => {
  it("serves synchronous <head> metadata to all crawlers and caps image srcset widths below 2000px", async () => {
    const { default: configureNext } = await import("../../next.config");
    const nextConfig = configureNext(PHASE_DEVELOPMENT_SERVER);
    const botPattern = nextConfig.htmlLimitedBots;
    expect(botPattern).toBeInstanceOf(RegExp);
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)",
      "OAI-SearchBot/1.0",
      "ClaudeBot/1.0",
      "PerplexityBot/1.0",
      "SEO-Skill/1.0",
      "curl/8.7.1",
    ]) {
      expect(botPattern?.test(ua)).toBe(true);
    }
    expect(
      botPattern?.test(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      ),
    ).toBe(false);

    const deviceSizes = nextConfig.images?.deviceSizes ?? [];
    expect(deviceSizes.length).toBeGreaterThan(0);
    expect(Math.max(...deviceSizes)).toBeLessThanOrEqual(1920);
  });

  it("omits root layout canonical fallback while keeping homepage self-canonicalized", () => {
    expect(rootMetadata.alternates?.canonical).toBeUndefined();
    expect(homeMetadata.alternates?.canonical).toBe("https://williamcallahan.com/");
  });

  it("emits enriched Knowledge Graph Person entity and truthful non-authored bookmark schema", () => {
    const graph = generateSchemaGraph({
      path: "/bookmarks/example-resource",
      title: "Example External Engineering Guide",
      description: "Saved engineering guide from an external domain.",
      datePublished: "2026-01-01T00:00:00-08:00",
      dateModified: "2026-01-02T00:00:00-08:00",
      type: "bookmark-item",
      bookmark: { url: "https://example.com/guide" },
    });

    const entities = graph["@graph"];
    const person = entities.find((node) => node["@type"] === "Person");
    expect(person).toBeDefined();
    expect(person?.jobTitle).toBe("Founder & CEO");
    expect(person?.worksFor).toMatchObject({
      "@type": "Organization",
      name: "aVenture",
      url: "https://aventure.vc",
    });
    expect(person?.sameAs).toEqual(
      expect.arrayContaining([
        "https://x.com/williamcallahan",
        "https://linkedin.com/in/williamacallahan",
        "https://github.com/WilliamAGH",
        "https://bsky.app/profile/williamcallahan.com",
        "https://aventure.vc",
      ]),
    );
    expect(person?.alumniOf).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Creighton University" }),
        expect.objectContaining({ name: "Techstars" }),
      ]),
    );
    expect(person?.hasCredential).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: expect.stringContaining("CFA") }),
        expect.objectContaining({ name: expect.stringContaining("CFP") }),
      ]),
    );

    const bookmarkNode = entities.find((node) => node["@id"].endsWith("#bookmark"));
    expect(bookmarkNode).toBeDefined();
    expect(bookmarkNode?.["@type"]).not.toBe("Article");
    expect(bookmarkNode).not.toHaveProperty("author");
  });

  it("disallows utility and auth paths in production robots.txt", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://williamcallahan.com");
    vi.stubEnv("API_BASE_URL", "https://williamcallahan.com");
    try {
      const result = robots();
      const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
      expect(rules?.disallow).toEqual(
        expect.arrayContaining(["/api/admin/", "/api/upload/", "/api/debug/"]),
      );
      expect(rules?.disallow).not.toContain("/sign-in");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("marks non-canonical deployment hosts with X-Robots-Tag noindex in proxy", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://williamcallahan.com");
    vi.stubEnv("API_BASE_URL", "https://williamcallahan.com");
    try {
      const { proxy } = await import("@/proxy");
      const devHostReq = new NextRequest("https://dev.williamcallahan.com/blog", {
        headers: { host: "dev.williamcallahan.com" },
      });
      const devHostRes = await proxy(devHostReq);
      expect(devHostRes.headers.get("X-Robots-Tag")).toContain("noindex");

      const prodHostReq = new NextRequest("https://williamcallahan.com/blog", {
        headers: { host: "williamcallahan.com" },
      });
      const prodHostRes = await proxy(prodHostReq);
      expect(prodHostRes.headers.get("X-Robots-Tag")).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("serves machine-readable entity and navigation context at /llms.txt", async () => {
    const { GET } = await import("@/app/llms.txt/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    const text = await response.text();
    expect(text).toContain("# William Callahan");
    expect(text).toContain("aVenture");
    expect(text).toContain("https://williamcallahan.com/blog");
    expect(text).toContain("https://williamcallahan.com/projects");
  });
});
