import { getTableColumns, getTableName } from "drizzle-orm";
import { projects } from "@/lib/db/schema/projects";

describe("projects schema", () => {
  it("has the expected table name", () => {
    expect(getTableName(projects)).toBe("projects");
  });

  it("includes all expected columns", () => {
    const columns = Object.keys(getTableColumns(projects));
    const expected = [
      "id",
      "name",
      "slug",
      "description",
      "shortSummary",
      "url",
      "githubUrl",
      "imageKey",
      "tags",
      "techStack",
      "note",
      "cvFeatured",
      "registryLinks",
      "searchVector",
    ];
    for (const col of expected) {
      expect(columns).toContain(col);
    }
  });

  it("does NOT have an embedding column (embeddings in content_embeddings)", () => {
    const columns = Object.keys(getTableColumns(projects));
    expect(columns).not.toContain("qwen4bFp16Embedding");
    expect(columns).not.toContain("embedding");
  });

  it("has a search_vector column for FTS", () => {
    const columns = getTableColumns(projects);
    expect(columns.searchVector).toBeDefined();
  });
});
