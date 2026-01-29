/**
 * @file Unit tests for pdf-parser module
 * Tests PDF parsing with mocked pdf-parse library.
 * @module __tests__/lib/books/pdf-parser.test
 */

// Mock pdf-parse before imports
const mockGetInfo = jest.fn();
const mockGetText = jest.fn();
const mockDestroy = jest.fn();

jest.mock("pdf-parse", () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    getInfo: mockGetInfo,
    getText: mockGetText,
    destroy: mockDestroy,
  })),
}));

import { parsePdfFromBuffer, extractPdfMetadata, getPdfFullText } from "@/lib/books/pdf-parser";

describe("PDF Parser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDestroy.mockResolvedValue(undefined);
  });

  describe("parsePdfFromBuffer", () => {
    it("should parse PDF with valid metadata and pages", async () => {
      mockGetInfo.mockResolvedValue({
        info: {
          Title: "Test Book",
          Author: "Test Author",
          Publisher: "Test Publisher",
          Subject: "A test book description",
          CreationDate: "D:20240115120000",
        },
      });

      mockGetText.mockResolvedValue({
        pages: [
          { num: 1, text: "First page content here." },
          { num: 2, text: "Second page content here." },
        ],
      });

      const buffer = Buffer.from("fake pdf content");
      const result = await parsePdfFromBuffer(buffer);

      expect(result.metadata).toEqual({
        title: "Test Book",
        author: "Test Author",
        publisher: "Test Publisher",
        description: "A test book description",
        date: "2024-01-15",
      });
      expect(result.pages).toHaveLength(2);
      expect(result.pages[0].pageNumber).toBe(1);
      expect(result.pages[0].textContent).toBe("First page content here.");
      expect(result.totalPages).toBe(2);
      expect(result.totalWordCount).toBeGreaterThan(0);
    });

    it("should use defaults for missing metadata", async () => {
      mockGetInfo.mockResolvedValue({ info: {} });
      mockGetText.mockResolvedValue({
        pages: [{ num: 1, text: "Some content" }],
      });

      const buffer = Buffer.from("fake pdf");
      const result = await parsePdfFromBuffer(buffer);

      expect(result.metadata.title).toBe("Unknown Title");
      expect(result.metadata.author).toBe("Unknown Author");
      expect(result.metadata.publisher).toBeUndefined();
    });

    it("should skip pages with minimal content", async () => {
      mockGetInfo.mockResolvedValue({ info: { Title: "Book" } });
      mockGetText.mockResolvedValue({
        pages: [
          { num: 1, text: "Good content here with enough words" },
          { num: 2, text: "Hi" }, // Too short, should be skipped
          { num: 3, text: "Another good page with content" },
        ],
      });

      const buffer = Buffer.from("fake pdf");
      const result = await parsePdfFromBuffer(buffer);

      expect(result.pages).toHaveLength(2);
      expect(result.pages.map((p) => p.pageNumber)).toEqual([1, 3]);
    });

    it("should respect maxPages option", async () => {
      mockGetInfo.mockResolvedValue({ info: {} });
      mockGetText.mockResolvedValue({
        pages: [
          { num: 1, text: "Page one content" },
          { num: 2, text: "Page two content" },
        ],
      });

      const buffer = Buffer.from("fake pdf");
      await parsePdfFromBuffer(buffer, { maxPages: 2 });

      expect(mockGetText).toHaveBeenCalledWith({ partial: [1, 2] });
    });

    it("should always destroy parser on success", async () => {
      mockGetInfo.mockResolvedValue({ info: {} });
      mockGetText.mockResolvedValue({ pages: [] });

      const buffer = Buffer.from("fake pdf");
      await parsePdfFromBuffer(buffer);

      expect(mockDestroy).toHaveBeenCalled();
    });

    it("should destroy parser even on error", async () => {
      mockGetInfo.mockRejectedValue(new Error("Parse error"));

      const buffer = Buffer.from("fake pdf");

      await expect(parsePdfFromBuffer(buffer)).rejects.toThrow("Parse error");
      expect(mockDestroy).toHaveBeenCalled();
    });

    it("should normalize text content", async () => {
      mockGetInfo.mockResolvedValue({ info: {} });
      mockGetText.mockResolvedValue({
        pages: [
          {
            num: 1,
            text: "  Multiple   spaces   here  \n\n\n\n  Too many newlines  ",
          },
        ],
      });

      const buffer = Buffer.from("fake pdf");
      const result = await parsePdfFromBuffer(buffer);

      // Should have normalized whitespace
      expect(result.pages[0].textContent).not.toContain("   ");
      expect(result.pages[0].textContent).not.toContain("\n\n\n");
    });

    it("should handle ISO date format", async () => {
      mockGetInfo.mockResolvedValue({
        info: { CreationDate: "2024-03-15" },
      });
      mockGetText.mockResolvedValue({ pages: [] });

      const buffer = Buffer.from("fake pdf");
      const result = await parsePdfFromBuffer(buffer);

      expect(result.metadata.date).toBe("2024-03-15");
    });

    it("should use ModDate when CreationDate is missing", async () => {
      mockGetInfo.mockResolvedValue({
        info: { ModDate: "D:20231225093000" },
      });
      mockGetText.mockResolvedValue({ pages: [] });

      const buffer = Buffer.from("fake pdf");
      const result = await parsePdfFromBuffer(buffer);

      expect(result.metadata.date).toBe("2023-12-25");
    });
  });

  describe("extractPdfMetadata", () => {
    it("should extract only metadata without parsing pages", async () => {
      mockGetInfo.mockResolvedValue({
        info: {
          Title: "Metadata Only",
          Author: "Some Author",
        },
      });

      const buffer = Buffer.from("fake pdf");
      const metadata = await extractPdfMetadata(buffer);

      expect(metadata.title).toBe("Metadata Only");
      expect(metadata.author).toBe("Some Author");
      // Should not call getText
      expect(mockGetText).not.toHaveBeenCalled();
      expect(mockDestroy).toHaveBeenCalled();
    });
  });

  describe("getPdfFullText", () => {
    it("should combine metadata and pages into formatted text", async () => {
      mockGetInfo.mockResolvedValue({
        info: {
          Title: "Full Text Book",
          Author: "Text Author",
          Publisher: "Text Publisher",
        },
      });
      mockGetText.mockResolvedValue({
        pages: [
          { num: 1, text: "First page text." },
          { num: 2, text: "Second page text." },
        ],
      });

      const buffer = Buffer.from("fake pdf");
      const fullText = await getPdfFullText(buffer);

      expect(fullText).toContain("Title: Full Text Book");
      expect(fullText).toContain("Author: Text Author");
      expect(fullText).toContain("Publisher: Text Publisher");
      expect(fullText).toContain("## Page 1");
      expect(fullText).toContain("First page text.");
      expect(fullText).toContain("## Page 2");
      expect(fullText).toContain("Second page text.");
    });
  });
});
