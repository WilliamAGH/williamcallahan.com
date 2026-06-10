import { getTableColumns, getTableName } from "drizzle-orm";
import { projects } from "@/lib/db/schema/projects";
import { projects as staticProjects } from "@/data/projects";
import {
  findProjectBySlug,
  generateProjectSlug,
  getAllProjectSlugs,
} from "@/lib/projects/slug-helpers";

function requireProjectById(id: string) {
  const project = staticProjects.find((candidate) => candidate.id === id);
  if (!project) {
    throw new Error(`Missing project fixture: ${id}`);
  }
  return project;
}

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

  it("does NOT have an embedding column (embeddings in embeddings)", () => {
    const columns = Object.keys(getTableColumns(projects));
    expect(columns).not.toContain("qwen4bFp16Embedding");
    expect(columns).not.toContain("embedding");
  });

  it("has a search_vector column for FTS", () => {
    const columns = getTableColumns(projects);
    expect(columns.searchVector).toBeDefined();
  });
});

describe("project slug helpers", () => {
  it("resolves id-derived project URLs without emitting them as canonical slugs", () => {
    const companyResearchTui = requireProjectById("tui-aventure-vc");
    const appleMapsJava = requireProjectById("apple-maps-java");
    const generatedSlugs = getAllProjectSlugs(staticProjects).map((entry) => entry.slug);

    expect(findProjectBySlug("tui-aventure-vc", staticProjects)).toBe(companyResearchTui);
    expect(findProjectBySlug("apple-maps-java", staticProjects)).toBe(appleMapsJava);
    expect(findProjectBySlug("company-research-tui", staticProjects)).toBe(companyResearchTui);
    expect(findProjectBySlug("apple-maps-java-sdk", staticProjects)).toBe(appleMapsJava);
    expect(generatedSlugs).toContain(generateProjectSlug(companyResearchTui.name));
    expect(generatedSlugs).toContain(generateProjectSlug(appleMapsJava.name));
    expect(generatedSlugs).not.toContain("tui-aventure-vc");
    expect(generatedSlugs).not.toContain("apple-maps-java");
  });
});
