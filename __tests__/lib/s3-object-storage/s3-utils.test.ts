/**
 * Tests for S3 Utils
 */
vi.mock("@/lib/s3/objects", () => ({
  getObject: vi.fn(),
  putObject: vi.fn(),
  checkIfS3ObjectExists: vi.fn(),
  getS3ObjectMetadata: vi.fn(),
  listS3Objects: vi.fn(),
  deleteFromS3: vi.fn(),
}));
vi.mock("@/lib/s3/json", () => ({
  readJsonS3: vi.fn(),
  writeJsonS3: vi.fn(),
}));
vi.mock("@/lib/s3/binary", () => ({
  readBinaryS3: vi.fn(),
  writeBinaryS3: vi.fn(),
}));

import {
  getObject,
  putObject,
  checkIfS3ObjectExists,
  getS3ObjectMetadata,
  listS3Objects,
  deleteFromS3,
} from "@/lib/s3/objects";
import { readJsonS3, writeJsonS3 } from "@/lib/s3/json";
import { readBinaryS3, writeBinaryS3 } from "@/lib/s3/binary";
import { z } from "zod/v4";
import type { Mock } from "vitest";

describe("S3 Utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Read Operations", () => {
    it("should read content from S3", async () => {
      const body = Buffer.from("Hello, World!");
      (getObject as Mock).mockResolvedValue({ body });

      const result = await getObject("test.txt");

      expect(result.body.toString("utf-8")).toBe("Hello, World!");
      expect(getObject).toHaveBeenCalledWith("test.txt");
    });

    it("should handle read errors", async () => {
      (getObject as Mock).mockRejectedValue(new Error("Read failed"));

      await expect(getObject("missing.txt")).rejects.toThrow("Read failed");
    });

    it("should read binary data", async () => {
      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      (readBinaryS3 as Mock).mockResolvedValue(buffer);

      const result = await readBinaryS3("test.png");

      expect(result).toEqual(buffer);
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it("should read JSON data", async () => {
      const data = { test: true, value: 42 };
      const schema = z.object({ test: z.boolean(), value: z.number() });
      (readJsonS3 as Mock).mockResolvedValue(data);

      const result = await readJsonS3("test.json", schema);

      expect(result).toEqual(data);
    });
  });

  describe("Write Operations", () => {
    it("should write content to S3", async () => {
      (putObject as Mock).mockResolvedValue({ eTag: '"etag"' });

      await putObject("test.txt", "Hello", { contentType: "text/plain" });

      expect(putObject).toHaveBeenCalledWith("test.txt", "Hello", { contentType: "text/plain" });
    });

    it("should write binary data", async () => {
      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      (writeBinaryS3 as Mock).mockResolvedValue(undefined);

      await writeBinaryS3("test.png", buffer);

      expect(writeBinaryS3).toHaveBeenCalledWith("test.png", buffer);
    });

    it("should write JSON data", async () => {
      (writeJsonS3 as Mock).mockResolvedValue(undefined);

      await writeJsonS3("test.json", { hello: "world" });

      expect(writeJsonS3).toHaveBeenCalledWith("test.json", { hello: "world" });
    });

    it("should handle write errors", async () => {
      (putObject as Mock).mockRejectedValue(new Error("Write failed"));

      await expect(putObject("test.txt", "data")).rejects.toThrow("Write failed");
    });
  });

  describe("Existence Checks", () => {
    it("should check if object exists", async () => {
      (checkIfS3ObjectExists as Mock).mockResolvedValue(true);

      const exists = await checkIfS3ObjectExists("test.txt");

      expect(exists).toBe(true);
      expect(checkIfS3ObjectExists).toHaveBeenCalledWith("test.txt");
    });

    it("should handle non-existent objects", async () => {
      (checkIfS3ObjectExists as Mock).mockResolvedValue(false);

      const exists = await checkIfS3ObjectExists("missing.txt");

      expect(exists).toBe(false);
    });
  });

  describe("Metadata Operations", () => {
    it("should get object metadata", async () => {
      const metadata = {
        eTag: '"abc123"',
        lastModified: new Date("2024-01-01"),
      };
      (getS3ObjectMetadata as Mock).mockResolvedValue(metadata);

      const result = await getS3ObjectMetadata("test.txt");

      expect(result).toEqual(metadata);
    });

    it("should handle missing metadata", async () => {
      (getS3ObjectMetadata as Mock).mockRejectedValue(new Error("Not found"));

      await expect(getS3ObjectMetadata("missing.txt")).rejects.toThrow("Not found");
    });
  });

  describe("List Operations", () => {
    it("should list objects with prefix", async () => {
      const objects = ["images/logo1.png", "images/logo2.png"];
      (listS3Objects as Mock).mockResolvedValue(objects);

      const result = await listS3Objects("images/");

      expect(result).toEqual(objects);
      expect(listS3Objects).toHaveBeenCalledWith("images/");
    });

    it("should handle empty results", async () => {
      (listS3Objects as Mock).mockResolvedValue([]);

      const result = await listS3Objects("empty/");

      expect(result).toEqual([]);
    });
  });

  describe("Delete Operations", () => {
    it("should delete objects", async () => {
      (deleteFromS3 as Mock).mockResolvedValue(undefined);

      await deleteFromS3("test.txt");

      expect(deleteFromS3).toHaveBeenCalledWith("test.txt");
    });

    it("should handle delete errors", async () => {
      (deleteFromS3 as Mock).mockRejectedValue(new Error("Delete failed"));

      await expect(deleteFromS3("test.txt")).rejects.toThrow("Delete failed");
    });
  });

  describe("Integration Scenarios", () => {
    it("should handle read-modify-write workflow", async () => {
      // Read existing data
      const schema = z.object({ count: z.number() });
      (readJsonS3 as Mock).mockResolvedValue({ count: 1 });

      const data = await readJsonS3("counter.json", schema);
      expect(data).toEqual({ count: 1 });

      // Modify data
      const updated = { count: data.count + 1 };

      // Write back
      (writeJsonS3 as Mock).mockResolvedValue(undefined);
      await writeJsonS3("counter.json", updated);

      expect(writeJsonS3).toHaveBeenCalledWith("counter.json", { count: 2 });
    });

    it("should handle conditional operations", async () => {
      // Check if exists
      (checkIfS3ObjectExists as Mock).mockResolvedValue(false);

      const exists = await checkIfS3ObjectExists("new-file.txt");

      if (!exists) {
        // Create new file
        (putObject as Mock).mockResolvedValue({ eTag: '"etag"' });
        await putObject("new-file.txt", "Initial content", { contentType: "text/plain" });

        expect(putObject).toHaveBeenCalled();
      }
    });
  });
});
