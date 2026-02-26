import { getTableColumns, getTableName } from "drizzle-orm";
import { booksIndividual } from "@/lib/db/schema/books-individual";

describe("books individual schema", () => {
  it("has the expected table name", () => {
    expect(getTableName(booksIndividual)).toBe("books");
  });

  it("includes all expected columns", () => {
    const columns = Object.keys(getTableColumns(booksIndividual));
    const expected = [
      "id",
      "title",
      "slug",
      "subtitle",
      "authors",
      "publisher",
      "publishedYear",
      "genres",
      "description",
      "formats",
      "isbn10",
      "isbn13",
      "asin",
      "audioNarrators",
      "audioDurationSeconds",
      "audioChapterCount",
      "coverUrl",
      "coverBlurDataURL",
      "findMyBookUrl",
      "publisherUrl",
      "amazonUrl",
      "audibleUrl",
      "bookshopUrl",
      "aiSummary",
      "thoughts",
      "searchVector",
    ];
    for (const col of expected) {
      expect(columns).toContain(col);
    }
  });

  it("does NOT have an embedding column (embeddings in content_embeddings)", () => {
    const columns = Object.keys(getTableColumns(booksIndividual));
    expect(columns).not.toContain("qwen4bFp16Embedding");
    expect(columns).not.toContain("embedding");
  });

  it("has a search_vector column for FTS", () => {
    const columns = getTableColumns(booksIndividual);
    expect(columns.searchVector).toBeDefined();
  });
});
