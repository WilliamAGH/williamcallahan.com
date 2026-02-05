/**
 * @vitest-environment node
 */
import { POST } from "@/app/api/upload/route";
import { writeBinaryS3 } from "@/lib/s3/binary";
import { deleteFromS3 } from "@/lib/s3/objects";
import { parsePdfFromBuffer } from "@/lib/books/pdf-parser";
import { parseEpubFromBuffer } from "@/lib/books/epub-parser";
import { indexBookToChroma } from "@/lib/books/chroma-sync";

vi.mock("@/lib/s3/binary", () => ({
  writeBinaryS3: vi.fn(),
}));

vi.mock("@/lib/s3/objects", () => ({
  deleteFromS3: vi.fn(),
}));

vi.mock("@/lib/books/pdf-parser", () => ({
  parsePdfFromBuffer: vi.fn(),
}));

vi.mock("@/lib/books/epub-parser", () => ({
  parseEpubFromBuffer: vi.fn(),
}));

vi.mock("@/lib/books/chroma-sync", () => ({
  indexBookToChroma: vi.fn(),
}));

describe("Upload API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("input validation", () => {
    it("returns 400 when no file is provided", async () => {
      const formData = new FormData();
      formData.set("fileType", "book-pdf");

      const request = new Request("http://localhost/api/upload", {
        method: "POST",
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe("No file provided");
    });

    it("returns 400 when fileType is missing", async () => {
      const formData = new FormData();
      const file = new File([new Uint8Array([1, 2, 3])], "test.pdf", {
        type: "application/pdf",
      });
      formData.set("file", file);
      // No fileType set

      const request = new Request("http://localhost/api/upload", {
        method: "POST",
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe("Invalid file type specified");
    });

    it("returns 400 when fileType is invalid", async () => {
      const formData = new FormData();
      const file = new File([new Uint8Array([1, 2, 3])], "test.pdf", {
        type: "application/pdf",
      });
      formData.set("file", file);
      formData.set("fileType", "invalid-type");

      const request = new Request("http://localhost/api/upload", {
        method: "POST",
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe("Invalid file type specified");
    });

    // Note: File size validation (MAX_FILE_SIZE = 100MB) at route.ts:192-200
    // cannot be unit tested because:
    // 1. File.size is readonly and FormData serialization recreates the File
    // 2. Creating actual 100MB+ buffers is impractical for unit tests
    // The size check exists in production code and should be verified via e2e tests
    it.todo("returns 400 when file exceeds 100MB size limit (requires e2e test)");

    it("returns 400 when file MIME type does not match declared fileType", async () => {
      const formData = new FormData();
      // Send a text file but claim it's a PDF
      const file = new File(["plain text content"], "fake.txt", {
        type: "text/plain",
      });
      formData.set("file", file);
      formData.set("fileType", "book-pdf");

      const request = new Request("http://localhost/api/upload", {
        method: "POST",
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
      // validateFileForType should reject mismatched MIME type
      expect(data.error).toBeDefined();
    });
  });

  describe("PDF processing", () => {
    it("uploads and processes PDF successfully", async () => {
      const writeBinaryS3Mock = vi.mocked(writeBinaryS3);
      const parsePdfFromBufferMock = vi.mocked(parsePdfFromBuffer);
      const indexBookToChromaMock = vi.mocked(indexBookToChroma);

      writeBinaryS3Mock.mockResolvedValue(undefined);
      parsePdfFromBufferMock.mockResolvedValue({
        metadata: { title: "Test Book", author: "Test Author" },
        pages: [{ pageNumber: 1, textContent: "Page 1 content" }],
        totalWordCount: 100,
      });
      indexBookToChromaMock.mockResolvedValue({
        success: true,
        chunksIndexed: 1,
      });

      const formData = new FormData();
      const file = new File([new Uint8Array([1, 2, 3])], "test.pdf", {
        type: "application/pdf",
      });
      formData.set("file", file);
      formData.set("fileType", "book-pdf");

      const request = new Request("http://localhost/api/upload", {
        method: "POST",
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.chromaStatus).toBe("indexed");
      expect(data.stats.chunksIndexed).toBe(1);
    });

    it("deletes S3 object when PDF processing fails", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const writeBinaryS3Mock = vi.mocked(writeBinaryS3);
      const deleteFromS3Mock = vi.mocked(deleteFromS3);
      const parsePdfFromBufferMock = vi.mocked(parsePdfFromBuffer);

      writeBinaryS3Mock.mockResolvedValue(undefined);
      deleteFromS3Mock.mockResolvedValue(undefined);
      parsePdfFromBufferMock.mockRejectedValue(new Error("Parse failed"));

      const formData = new FormData();
      const file = new File([new Uint8Array([1, 2, 3])], "test.pdf", {
        type: "application/pdf",
      });
      formData.set("file", file);
      formData.set("fileType", "book-pdf");

      const request = new Request("http://localhost/api/upload", {
        method: "POST",
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(500);

      expect(writeBinaryS3Mock).toHaveBeenCalledTimes(1);
      const s3Key = writeBinaryS3Mock.mock.calls[0]?.[0];
      expect(deleteFromS3Mock).toHaveBeenCalledWith(s3Key);
      consoleErrorSpy.mockRestore();
    });
  });

  describe("ePub processing", () => {
    it("uploads and processes ePub successfully", async () => {
      const writeBinaryS3Mock = vi.mocked(writeBinaryS3);
      const parseEpubFromBufferMock = vi.mocked(parseEpubFromBuffer);
      const indexBookToChromaMock = vi.mocked(indexBookToChroma);

      writeBinaryS3Mock.mockResolvedValue(undefined);
      parseEpubFromBufferMock.mockResolvedValue({
        metadata: { title: "Test ePub", creator: "Test Author" },
        chapters: [{ id: "ch1", title: "Chapter 1", textContent: "Chapter content" }],
        totalWordCount: 150,
      });
      indexBookToChromaMock.mockResolvedValue({
        success: true,
        chunksIndexed: 1,
      });

      const formData = new FormData();
      const file = new File([new Uint8Array([1, 2, 3])], "test.epub", {
        type: "application/epub+zip",
      });
      formData.set("file", file);
      formData.set("fileType", "book-epub");

      const request = new Request("http://localhost/api/upload", {
        method: "POST",
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.chromaStatus).toBe("indexed");
      expect(data.stats.chunksIndexed).toBe(1);
      expect(data.stats.totalWords).toBe(150);
    });

    it("deletes S3 object when ePub processing fails", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const consolLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const writeBinaryS3Mock = vi.mocked(writeBinaryS3);
      const deleteFromS3Mock = vi.mocked(deleteFromS3);
      const parseEpubFromBufferMock = vi.mocked(parseEpubFromBuffer);

      writeBinaryS3Mock.mockResolvedValue(undefined);
      deleteFromS3Mock.mockResolvedValue(undefined);
      parseEpubFromBufferMock.mockRejectedValue(new Error("ePub parse failed"));

      const formData = new FormData();
      const file = new File([new Uint8Array([1, 2, 3])], "test.epub", {
        type: "application/epub+zip",
      });
      formData.set("file", file);
      formData.set("fileType", "book-epub");

      const request = new Request("http://localhost/api/upload", {
        method: "POST",
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(500);

      expect(writeBinaryS3Mock).toHaveBeenCalledTimes(1);
      const s3Key = writeBinaryS3Mock.mock.calls[0]?.[0];
      expect(deleteFromS3Mock).toHaveBeenCalledWith(s3Key);

      consoleErrorSpy.mockRestore();
      consolLogSpy.mockRestore();
    });
  });

  describe("cleanup behavior", () => {
    it("logs error but still throws when S3 cleanup fails", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const consolLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const writeBinaryS3Mock = vi.mocked(writeBinaryS3);
      const deleteFromS3Mock = vi.mocked(deleteFromS3);
      const parsePdfFromBufferMock = vi.mocked(parsePdfFromBuffer);

      writeBinaryS3Mock.mockResolvedValue(undefined);
      deleteFromS3Mock.mockRejectedValue(new Error("S3 delete failed"));
      parsePdfFromBufferMock.mockRejectedValue(new Error("Parse failed"));

      const formData = new FormData();
      const file = new File([new Uint8Array([1, 2, 3])], "test.pdf", {
        type: "application/pdf",
      });
      formData.set("file", file);
      formData.set("fileType", "book-pdf");

      const request = new Request("http://localhost/api/upload", {
        method: "POST",
        body: formData,
      });

      const response = await POST(request);
      // Original error should still be thrown (500)
      expect(response.status).toBe(500);

      const data = await response.json();
      expect(data.error).toBe("Parse failed");

      // S3 cleanup was attempted
      expect(deleteFromS3Mock).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
      consolLogSpy.mockRestore();
    });
  });
});
