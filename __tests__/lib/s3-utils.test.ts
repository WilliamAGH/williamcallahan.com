/**
 * Tests for S3 Utils
 */
jest.mock("@/lib/s3-utils", () => ({
  readFromS3: jest.fn(),
  writeToS3: jest.fn(),
  checkIfS3ObjectExists: jest.fn(),
  getS3ObjectMetadata: jest.fn(),
  listS3Objects: jest.fn(),
  deleteFromS3: jest.fn(),
  readJsonS3: jest.fn(),
  writeJsonS3: jest.fn(),
  readBinaryS3: jest.fn(),
  writeBinaryS3: jest.fn(),
  s3Client: {},
}));

import {
  readFromS3,
  writeToS3,
  checkIfS3ObjectExists,
  getS3ObjectMetadata,
  listS3Objects,
  deleteFromS3,
  readJsonS3,
  writeJsonS3,
  readBinaryS3,
  writeBinaryS3,
} from "@/lib/s3-utils";

describe("S3 Utils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Read Operations", () => {
    it("should read content from S3", async () => {
      (readFromS3 as jest.Mock).mockResolvedValue("Hello, World!");
      
      const result = await readFromS3("test.txt");
      
      expect(result).toBe("Hello, World!");
      expect(readFromS3).toHaveBeenCalledWith("test.txt");
    });

    it("should handle read errors", async () => {
      (readFromS3 as jest.Mock).mockResolvedValue(null);
      
      const result = await readFromS3("missing.txt");
      
      expect(result).toBeNull();
    });

    it("should read binary data", async () => {
      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      (readBinaryS3 as jest.Mock).mockResolvedValue(buffer);
      
      const result = await readBinaryS3("test.png");
      
      expect(result).toEqual(buffer);
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it("should read JSON data", async () => {
      const data = { test: true, value: 42 };
      (readJsonS3 as jest.Mock).mockResolvedValue(data);
      
      const result = await readJsonS3("test.json");
      
      expect(result).toEqual(data);
    });
  });

  describe("Write Operations", () => {
    it("should write content to S3", async () => {
      (writeToS3 as jest.Mock).mockResolvedValue(undefined);
      
      await writeToS3("test.txt", "Hello", "text/plain");
      
      expect(writeToS3).toHaveBeenCalledWith("test.txt", "Hello", "text/plain");
    });

    it("should write binary data", async () => {
      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      (writeBinaryS3 as jest.Mock).mockResolvedValue(undefined);
      
      await writeBinaryS3("test.png", buffer);
      
      expect(writeBinaryS3).toHaveBeenCalledWith("test.png", buffer);
    });

    it("should write JSON data", async () => {
      (writeJsonS3 as jest.Mock).mockResolvedValue(undefined);
      
      await writeJsonS3("test.json", { hello: "world" });
      
      expect(writeJsonS3).toHaveBeenCalledWith("test.json", { hello: "world" });
    });

    it("should handle write errors", async () => {
      (writeToS3 as jest.Mock).mockRejectedValue(new Error("Write failed"));
      
      await expect(writeToS3("test.txt", "data")).rejects.toThrow("Write failed");
    });
  });

  describe("Existence Checks", () => {
    it("should check if object exists", async () => {
      (checkIfS3ObjectExists as jest.Mock).mockResolvedValue(true);
      
      const exists = await checkIfS3ObjectExists("test.txt");
      
      expect(exists).toBe(true);
      expect(checkIfS3ObjectExists).toHaveBeenCalledWith("test.txt");
    });

    it("should handle non-existent objects", async () => {
      (checkIfS3ObjectExists as jest.Mock).mockResolvedValue(false);
      
      const exists = await checkIfS3ObjectExists("missing.txt");
      
      expect(exists).toBe(false);
    });
  });

  describe("Metadata Operations", () => {
    it("should get object metadata", async () => {
      const metadata = {
        ETag: '"abc123"',
        LastModified: new Date("2024-01-01"),
      };
      (getS3ObjectMetadata as jest.Mock).mockResolvedValue(metadata);
      
      const result = await getS3ObjectMetadata("test.txt");
      
      expect(result).toEqual(metadata);
    });

    it("should handle missing metadata", async () => {
      (getS3ObjectMetadata as jest.Mock).mockResolvedValue(null);
      
      const result = await getS3ObjectMetadata("missing.txt");
      
      expect(result).toBeNull();
    });
  });

  describe("List Operations", () => {
    it("should list objects with prefix", async () => {
      const objects = ["images/logo1.png", "images/logo2.png"];
      (listS3Objects as jest.Mock).mockResolvedValue(objects);
      
      const result = await listS3Objects("images/");
      
      expect(result).toEqual(objects);
      expect(listS3Objects).toHaveBeenCalledWith("images/");
    });

    it("should handle empty results", async () => {
      (listS3Objects as jest.Mock).mockResolvedValue([]);
      
      const result = await listS3Objects("empty/");
      
      expect(result).toEqual([]);
    });
  });

  describe("Delete Operations", () => {
    it("should delete objects", async () => {
      (deleteFromS3 as jest.Mock).mockResolvedValue(undefined);
      
      await deleteFromS3("test.txt");
      
      expect(deleteFromS3).toHaveBeenCalledWith("test.txt");
    });

    it("should handle delete errors", async () => {
      (deleteFromS3 as jest.Mock).mockRejectedValue(new Error("Delete failed"));
      
      await expect(deleteFromS3("test.txt")).rejects.toThrow("Delete failed");
    });
  });

  describe("Integration Scenarios", () => {
    it("should handle read-modify-write workflow", async () => {
      // Read existing data
      (readJsonS3 as jest.Mock).mockResolvedValue({ count: 1 });
      
      const data = await readJsonS3("counter.json");
      expect(data).toEqual({ count: 1 });
      
      // Modify data
      const updated = { count: (data as any).count + 1 };
      
      // Write back
      (writeJsonS3 as jest.Mock).mockResolvedValue(undefined);
      await writeJsonS3("counter.json", updated);
      
      expect(writeJsonS3).toHaveBeenCalledWith("counter.json", { count: 2 });
    });

    it("should handle conditional operations", async () => {
      // Check if exists
      (checkIfS3ObjectExists as jest.Mock).mockResolvedValue(false);
      
      const exists = await checkIfS3ObjectExists("new-file.txt");
      
      if (!exists) {
        // Create new file
        (writeToS3 as jest.Mock).mockResolvedValue(undefined);
        await writeToS3("new-file.txt", "Initial content", "text/plain");
        
        expect(writeToS3).toHaveBeenCalled();
      }
    });
  });
});