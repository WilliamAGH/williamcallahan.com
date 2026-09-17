/**
 * listTagCounts: the rows PostgreSQL returns are projected into AggregatedTag
 * with the slug and route that the canonical tag owner defines.
 *
 * The aggregate SQL itself needs a database and is not exercised here; this
 * pins the mapping, which is where a content type can silently get the wrong
 * route or an unslugged tag.
 *
 * @module __tests__/lib/db/queries/tag-counts
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));
vi.mock("@/lib/db/connection", () => ({ db: { execute: mockExecute } }));

import { listTagCounts } from "@/lib/db/queries/tag-counts";
import { TAG_URL, tagToSlug } from "@/lib/utils/tag-utils";
import { kebabCase } from "@/lib/utils/formatters";

describe("listTagCounts", () => {
  beforeEach(() => mockExecute.mockReset());

  it("routes every content type through its own tag listing URL", async () => {
    mockExecute.mockResolvedValueOnce([
      { name: "react", content_type: "blog", count: 4 },
      { name: "ai", content_type: "bookmarks", count: 3 },
      { name: "typescript", content_type: "projects", count: 2 },
      { name: "fiction", content_type: "books", count: 1 },
    ]);

    const tags = await listTagCounts();

    // Bind the canonical owner rather than restating the routes here ([SS1c]).
    expect(tags.map((tag) => tag.url)).toEqual([
      TAG_URL.blog("react"),
      TAG_URL.bookmarks("ai"),
      TAG_URL.projects("typescript"),
      TAG_URL.books("fiction"),
    ]);
  });

  it("slugs the tag name and keeps the raw name for display", async () => {
    mockExecute.mockResolvedValueOnce([{ name: "next.js", content_type: "blog", count: 7 }]);

    const [tag] = await listTagCounts();

    expect(tag).toEqual({
      name: "next.js",
      slug: tagToSlug("next.js"),
      contentType: "blog",
      count: 7,
      url: TAG_URL.blog("next.js"),
    });
  });

  it("links a dotted blog tag to the slug its route actually serves", async () => {
    // src/app/blog/tags/[tagSlug] resolves on kebabCase, so linking the
    // tagToSlug form 404s: "agents.md" is served at agents-md, not agentsdotmd.
    mockExecute.mockResolvedValueOnce([{ name: "agents.md", content_type: "blog", count: 2 }]);

    const [tag] = await listTagCounts();

    expect(tag?.url).toBe(`/blog/tags/${kebabCase("agents.md")}`);
    expect(tag?.url).not.toContain(tagToSlug("agents.md"));
  });

  it("coerces a driver-stringified count to a number", async () => {
    mockExecute.mockResolvedValueOnce([{ name: "rust", content_type: "blog", count: "12" }]);

    const [tag] = await listTagCounts();

    expect(tag?.count).toBe(12);
  });
});
