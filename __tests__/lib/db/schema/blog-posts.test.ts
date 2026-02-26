import { getTableColumns, getTableName } from "drizzle-orm";
import { blogPosts } from "@/lib/db/schema/blog-posts";

describe("blog posts schema", () => {
  it("has the expected table name", () => {
    expect(getTableName(blogPosts)).toBe("blog_posts");
  });

  it("includes all expected columns", () => {
    const columns = Object.keys(getTableColumns(blogPosts));
    const expected = [
      "id",
      "title",
      "slug",
      "excerpt",
      "authorName",
      "tags",
      "publishedAt",
      "updatedAt",
      "coverImage",
      "draft",
      "rawContent",
      "searchVector",
    ];
    for (const col of expected) {
      expect(columns).toContain(col);
    }
  });

  it("does NOT have an embedding column (embeddings in embeddings)", () => {
    const columns = Object.keys(getTableColumns(blogPosts));
    expect(columns).not.toContain("qwen4bFp16Embedding");
    expect(columns).not.toContain("embedding");
  });

  it("has a search_vector column for FTS", () => {
    const columns = getTableColumns(blogPosts);
    expect(columns.searchVector).toBeDefined();
  });
});
