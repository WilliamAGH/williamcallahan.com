/**
 * Integration test: compile the Techstars article with the real MDX toolchain and ensure
 * it does not fall back to the error marker and does not contain nested <p> tags in the
 * References section.
 */

vi.setConfig({ testTimeout: 60_000 });

// Ensure we use the real serializer; plugin ESM packages remain mocked by config for CJS interop in tests
vi.doUnmock("next-mdx-remote/serialize");
vi.doUnmock("next-mdx-remote");

import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { getMDXPost } from "../../src/lib/blog/mdx";
import { clearBlogPostFilePathIndex, findBlogPostFilePath } from "@/lib/blog/validation";
import { blogFrontmatterSchema } from "@/types/schemas/blog-frontmatter";

const POSTS_DIR = path.join(process.cwd(), "data/blog/posts");
const FILE = path.join(POSTS_DIR, "how-much-does-techstars-invest.mdx");

const validFrontmatter = {
  slug: "frontmatter-contract",
  title: "Frontmatter contract",
  author: "william-callahan",
  publishedAt: "2026-01-01",
  excerpt: "Frontmatter contract excerpt.",
  tags: ["Testing"],
};

describe("Blog frontmatter schema", () => {
  it("rejects unknown keys, including the removed modifiedAt alias", () => {
    expect(blogFrontmatterSchema.safeParse({ ...validFrontmatter, unexpected: true }).success).toBe(
      false,
    );
    expect(
      blogFrontmatterSchema.safeParse({ ...validFrontmatter, modifiedAt: "2026-01-02" }).success,
    ).toBe(false);
  });

  it("requires ISO date strings while retaining Date support", () => {
    expect(
      blogFrontmatterSchema.safeParse({ ...validFrontmatter, publishedAt: "2026-02-30" }).success,
    ).toBe(false);
    expect(
      blogFrontmatterSchema.safeParse({ ...validFrontmatter, updatedAt: "January 2, 2026" })
        .success,
    ).toBe(false);
    expect(
      blogFrontmatterSchema.safeParse({
        ...validFrontmatter,
        publishedAt: new Date("2026-01-01T00:00:00.000Z"),
      }).success,
    ).toBe(true);
  });

  it("trims text values and rejects blank values", () => {
    const parsed = blogFrontmatterSchema.parse({
      ...validFrontmatter,
      excerpt: "  Concise summary.  ",
      coverImage: "  /images/posts/example.png  ",
    });

    expect(parsed.excerpt).toBe("Concise summary.");
    expect(parsed.coverImage).toBe("/images/posts/example.png");
    expect(blogFrontmatterSchema.safeParse({ ...validFrontmatter, excerpt: " \t " }).success).toBe(
      false,
    );
    expect(
      blogFrontmatterSchema.safeParse({ ...validFrontmatter, coverImage: " \n " }).success,
    ).toBe(false);
    expect(blogFrontmatterSchema.safeParse({ ...validFrontmatter, tags: [" "] }).success).toBe(
      false,
    );
  });

  it("requires the canonical tags field", () => {
    const { tags: _tags, ...frontmatterWithoutTags } = validFrontmatter;
    expect(blogFrontmatterSchema.safeParse(frontmatterWithoutTags).success).toBe(false);
  });
});

describe("MDX integration – References markup", () => {
  it("rejects an invalid canonical frontmatter slug", async () => {
    const source = `---
title: Invalid Slug
slug: Bad_Slug
publishedAt: 2026-01-01
author: william-callahan
excerpt: Invalid slug fixture.
tags: [Testing]
---
Content`;

    expect(await getMDXPost("Bad_Slug", FILE, source, true)).toBeNull();
  });

  it("rejects scalar frontmatter tags", async () => {
    const source = `---
title: Invalid Tags
slug: invalid-tags
publishedAt: 2026-01-01
author: william-callahan
excerpt: Invalid tags fixture.
tags: Testing
---
Content`;

    expect(await getMDXPost("invalid-tags", FILE, source, true)).toBeNull();
  });

  it("rejects the removed modifiedAt alias during MDX ingestion", async () => {
    const source = `---
title: Removed Alias
slug: removed-alias
publishedAt: 2026-01-01
modifiedAt: 2026-01-02
author: william-callahan
excerpt: Removed alias fixture.
tags: [Testing]
---
Content`;

    expect(await getMDXPost("removed-alias", FILE, source, true)).toBeNull();
  });

  it("resolves canonical frontmatter slugs when filenames differ", async () => {
    const filePath = await findBlogPostFilePath("how-to-add-a-symlink-file-from-one-to-another");
    expect(filePath).toBe(path.join(POSTS_DIR, "how-to-add-a-symlink-file.mdx"));
  });

  it("propagates filesystem failures while indexing frontmatter slugs", async () => {
    clearBlogPostFilePathIndex();
    const readError = new Error("Blog post read failed");
    const readFileSpy = vi.spyOn(fs, "readFile").mockRejectedValueOnce(readError);

    try {
      await expect(findBlogPostFilePath(validFrontmatter.slug)).rejects.toBe(readError);
    } finally {
      readFileSpy.mockRestore();
      clearBlogPostFilePathIndex();
    }
  });

  it("compiles and produces no nested <p> in references", async () => {
    const source = await fs.readFile(FILE, "utf8");
    const frontmatter = blogFrontmatterSchema.parse(matter(source).data);
    const post = await getMDXPost(frontmatter.slug, FILE, source);
    expect(post).not.toBeNull();
    if (!post) return;

    const compiled = JSON.stringify(post.content);

    // Heuristic: ensure we didn't produce nested <p><p> anywhere
    expect(compiled).not.toMatch(/<p[^>]*>\s*<p[^>]*>/i);

    // Confirm references structure exists
    expect(post.rawContent).toContain('<div id="references"');
  });
});
