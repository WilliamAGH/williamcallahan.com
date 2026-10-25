/**
 * Blog Route Slug Tests
 *
 * Blog routes resolve canonical frontmatter slugs, which can differ from the
 * MDX filename a post was first published under.
 */

import path from "node:path";
import { getAllPostsMeta, getPostMetaBySlug } from "../../src/lib/blog";

describe("Blog Post Routes", () => {
  it("resolves a canonical slug whose MDX filename differs", async () => {
    const posts = await getAllPostsMeta();
    const mismatchedPost = posts.find(
      (post) => post.filePath && path.basename(post.filePath, ".mdx") !== post.slug,
    );
    if (!mismatchedPost)
      throw new Error("Expected a post whose canonical slug differs from its filename.");

    const resolvedPost = await getPostMetaBySlug(mismatchedPost.slug);
    expect(resolvedPost?.slug).toBe(mismatchedPost.slug);
    expect(resolvedPost?.filePath).toBe(mismatchedPost.filePath);
  });
});
