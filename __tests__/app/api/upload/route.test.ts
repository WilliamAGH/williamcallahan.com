/**
 * @vitest-environment node
 */
import { POST } from "@/app/api/upload/route";
import { writeBinaryS3 } from "@/lib/s3/binary";
import { deleteFromS3 } from "@/lib/s3/objects";
import { parsePdfFromBuffer } from "@/lib/books/pdf-parser";

vi.mock("@/lib/s3/binary", () => ({
  writeBinaryS3: vi.fn(),
}));

vi.mock("@/lib/s3/objects", () => ({
  deleteFromS3: vi.fn(),
}));

vi.mock("@/lib/books/pdf-parser", () => ({
  parsePdfFromBuffer: vi.fn(),
}));

describe("Upload API cleanup behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
