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

const POSTS_DIR = path.join(process.cwd(), "data/blog/posts");
const FILE = path.join(POSTS_DIR, "how-much-does-techstars-invest.mdx");

describe("MDX integration – References markup", () => {
  it("compiles without fallback marker and produces no nested <p> in references", async () => {
    const source = await fs.readFile(FILE, "utf8");
    const { data } = matter(source) as unknown as { data: { slug: string } };
    const post = await getMDXPost(data.slug.trim(), FILE, source);
    expect(post).not.toBeNull();
    if (!post) return;

    const FALLBACK = "Unable to render content due to MDX errors.";
    const compiled = JSON.stringify(post.content);
    expect(compiled).not.toContain(FALLBACK);

    // Heuristic: ensure we didn't produce nested <p><p> anywhere
    expect(compiled).not.toMatch(/<p[^>]*>\s*<p[^>]*>/i);

    // Confirm references structure exists
    expect(post.rawContent).toContain('<div id="references"');
  });
});
