import { getTableColumns, getTableName } from "drizzle-orm";
import { investments } from "@/lib/db/schema/investments";

describe("investments schema", () => {
  it("has the expected table name", () => {
    expect(getTableName(investments)).toBe("investments");
  });

  it("includes all expected columns", () => {
    const columns = Object.keys(getTableColumns(investments));
    const expected = [
      "id",
      "name",
      "slug",
      "description",
      "type",
      "stage",
      "category",
      "status",
      "operatingStatus",
      "investedYear",
      "foundedYear",
      "shutdownYear",
      "acquiredYear",
      "location",
      "website",
      "aventureUrl",
      "logoOnlyDomain",
      "logo",
      "multiple",
      "holdingReturn",
      "accelerator",
      "details",
      "metrics",
      "searchVector",
    ];
    for (const col of expected) {
      expect(columns).toContain(col);
    }
  });

  it("does NOT have an embedding column (embeddings in embeddings)", () => {
    const columns = Object.keys(getTableColumns(investments));
    expect(columns).not.toContain("qwen4bFp16Embedding");
    expect(columns).not.toContain("embedding");
  });

  it("has a search_vector column for FTS", () => {
    const columns = getTableColumns(investments);
    expect(columns.searchVector).toBeDefined();
  });
});
