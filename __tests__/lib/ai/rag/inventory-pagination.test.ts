/**
 * Tests for RAG Inventory Pagination
 *
 * Validates pagination logic including the fix for the double-slicing bug
 * where buildPaginatedSectionLines was slicing already-paginated rows.
 *
 * @vitest-environment node
 */

import { buildPaginatedSectionLines, formatPaginatedHeader } from "@/lib/ai/rag/inventory-format";
import { calculatePaginationMeta, paginateRows } from "@/lib/ai/rag/inventory-pagination";
import type { InventoryPaginationMeta } from "@/types/rag";

describe("paginateRows", () => {
  const rows = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];

  it("returns first page items correctly", () => {
    expect(paginateRows(rows, 1, 3)).toEqual(["a", "b", "c"]);
  });

  it("returns middle page items correctly", () => {
    expect(paginateRows(rows, 2, 3)).toEqual(["d", "e", "f"]);
  });

  it("returns last page items correctly (partial)", () => {
    expect(paginateRows(rows, 4, 3)).toEqual(["j"]);
  });

  it("returns empty array for page beyond total", () => {
    expect(paginateRows(rows, 5, 3)).toEqual([]);
  });
});

describe("calculatePaginationMeta", () => {
  it("calculates correct metadata for first page", () => {
    const meta = calculatePaginationMeta("investments", 98, 1, 25);

    expect(meta.section).toBe("investments");
    expect(meta.page).toBe(1);
    expect(meta.totalPages).toBe(4);
    expect(meta.totalItems).toBe(98);
    expect(meta.itemsOnPage).toBe(25);
    expect(meta.hasMore).toBe(true);
  });

  it("calculates correct metadata for middle page", () => {
    const meta = calculatePaginationMeta("investments", 98, 2, 25);

    expect(meta.page).toBe(2);
    expect(meta.itemsOnPage).toBe(25);
    expect(meta.hasMore).toBe(true);
  });

  it("calculates correct metadata for last page", () => {
    const meta = calculatePaginationMeta("investments", 98, 4, 25);

    expect(meta.page).toBe(4);
    expect(meta.itemsOnPage).toBe(23); // 98 - 75 = 23 remaining
    expect(meta.hasMore).toBe(false);
  });

  it("clamps page number to valid range", () => {
    const meta = calculatePaginationMeta("investments", 10, 100, 25);

    expect(meta.page).toBe(1); // Only 1 page exists, so clamped
    expect(meta.totalPages).toBe(1);
  });
});

describe("buildPaginatedSectionLines", () => {
  const mockMeta = (page: number, totalItems: number, pageSize: number): InventoryPaginationMeta =>
    calculatePaginationMeta("investments", totalItems, page, pageSize);

  it("renders all provided rows on page 1", () => {
    const pageRows = ["row1", "row2", "row3"];
    const meta = mockMeta(1, 10, 3);

    const result = buildPaginatedSectionLines({
      name: "investments",
      fields: ["name", "type"],
      pageRows,
      pagination: meta,
      status: "success",
    });

    expect(result.lines).toContain("- row1");
    expect(result.lines).toContain("- row2");
    expect(result.lines).toContain("- row3");
    expect(result.includedItems).toBe(3);
  });

  it("renders all provided rows on page 2 (regression test for double-slice bug)", () => {
    // This test verifies the fix for the double-slicing bug.
    // Previously, buildPaginatedSectionLines would slice again, resulting in empty output.
    const pageRows = ["row4", "row5", "row6"]; // Already sliced by paginateRows
    const meta = mockMeta(2, 10, 3);

    const result = buildPaginatedSectionLines({
      name: "investments",
      fields: ["name", "type"],
      pageRows,
      pagination: meta,
      status: "success",
    });

    // All 3 rows should be rendered - the bug caused this to be empty
    expect(result.lines).toContain("- row4");
    expect(result.lines).toContain("- row5");
    expect(result.lines).toContain("- row6");
    expect(result.includedItems).toBe(3);
  });

  it("renders last page correctly with hasMore=false", () => {
    const pageRows = ["row10"];
    const meta = mockMeta(4, 10, 3);

    const result = buildPaginatedSectionLines({
      name: "investments",
      fields: ["name"],
      pageRows,
      pagination: meta,
      status: "success",
    });

    expect(result.lines).toContain("- row10");
    expect(result.includedItems).toBe(1);
    // Verify navigation hint indicates last page
    const navHint = result.lines.find((line) => line.includes("[Page"));
    expect(navHint).toContain("This is the last page");
  });

  it("includes navigation hint for pages with more content", () => {
    const pageRows = ["row1", "row2"];
    const meta = mockMeta(1, 10, 2);

    const result = buildPaginatedSectionLines({
      name: "investments",
      fields: ["name"],
      pageRows,
      pagination: meta,
      status: "success",
    });

    const navHint = result.lines.find((line) => line.includes("[Page"));
    expect(navHint).toContain('Say "next" or "more"');
  });
});

describe("formatPaginatedHeader", () => {
  it("includes page info in header", () => {
    const meta = calculatePaginationMeta("investments", 98, 2, 25);
    const header = formatPaginatedHeader("investments", meta, ["name", "type"]);

    expect(header).toContain("[Investments]");
    expect(header).toContain("page=2/4");
    expect(header).toContain("showing=25");
    expect(header).toContain("total=98");
    expect(header).toContain("hasMore=true");
  });
});
