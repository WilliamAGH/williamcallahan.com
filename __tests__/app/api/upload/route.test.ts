/**
 * @jest-environment node
 */
import { POST } from "@/app/api/upload/route";
import { deleteFromS3, writeBinaryS3 } from "@/lib/s3-utils";
import { parsePdfFromBuffer } from "@/lib/books/pdf-parser";

jest.mock("@/lib/s3-utils", () => ({
  writeBinaryS3: jest.fn(),
  deleteFromS3: jest.fn(),
}));

jest.mock("@/lib/books/pdf-parser", () => ({
  parsePdfFromBuffer: jest.fn(),
}));

describe("Upload API cleanup behavior", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("deletes S3 object when PDF processing fails", async () => {
    const writeBinaryS3Mock = jest.mocked(writeBinaryS3);
    const deleteFromS3Mock = jest.mocked(deleteFromS3);
    const parsePdfFromBufferMock = jest.mocked(parsePdfFromBuffer);

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
  });
});
