/**
 * Search Index Serialization Tests
 *
 * Tests the serialization and deserialization of MiniSearch indexes to ensure
 * they work correctly when stored to and loaded from S3.
 *
 * CRITICAL: These tests verify the fix for the "[object Object]" JSON parsing error
 * that occurs when MiniSearch indexes are stored and loaded from S3.
 */

import MiniSearch from "minisearch";
import { loadIndexFromJSON } from "@/lib/search/index-builder";
import type { SerializedIndex } from "@/types/search";

describe("Search Index Serialization", () => {
  // Sample data for creating test indexes
  const sampleDocuments = [
    { id: "1", title: "React Hooks Guide", description: "A guide to React hooks" },
    { id: "2", title: "TypeScript Basics", description: "Introduction to TypeScript" },
    { id: "3", title: "Next.js Tutorial", description: "Building apps with Next.js" },
  ];

  // Helper to create a configured MiniSearch index
  const createIndex = <T extends { id: string }>(docs: T[], fields: (keyof T & string)[]) => {
    const index = new MiniSearch<T>({
      fields,
      storeFields: ["id", ...fields] as string[],
      idField: "id",
    });
    index.addAll(docs);
    return index;
  };

  describe("loadIndexFromJSON - JSON parsing fix", () => {
    it("should NOT throw [object Object] error when index is an object", () => {
      // This test verifies the FIX for the critical bug:
      // Before fix: Passing an object to MiniSearch.loadJSON caused
      // "[object Object]" is not valid JSON error

      const originalIndex = createIndex(sampleDocuments, ["title", "description"]);

      // Create serialized index with object (not string) - this is what S3 returns
      const serializedIndex: SerializedIndex = {
        index: originalIndex.toJSON(), // Object, not string!
        metadata: {
          itemCount: sampleDocuments.length,
          buildTime: new Date().toISOString(),
          version: "1.0",
        },
      };

      // Before the fix, this would throw:
      // SyntaxError: "[object Object]" is not valid JSON
      // After the fix, it should NOT throw
      expect(() => {
        loadIndexFromJSON<(typeof sampleDocuments)[0]>(serializedIndex);
      }).not.toThrow();
    });

    it("should load index when serialized.index is a string", () => {
      const originalIndex = createIndex(sampleDocuments, ["title", "description"]);
      const indexString = JSON.stringify(originalIndex.toJSON());

      const serializedIndex: SerializedIndex = {
        index: indexString, // String format
        metadata: {
          itemCount: sampleDocuments.length,
          buildTime: new Date().toISOString(),
          version: "1.0",
        },
      };

      // Should not throw
      expect(() => {
        loadIndexFromJSON<(typeof sampleDocuments)[0]>(serializedIndex);
      }).not.toThrow();
    });

    it("should load index when serialized.index is an object (S3 round-trip)", () => {
      const originalIndex = createIndex(sampleDocuments, ["title", "description"]);

      // Simulate S3 round-trip:
      // 1. toJSON() returns object
      // 2. writeJsonS3 calls JSON.stringify (object -> string)
      // 3. S3 stores the string
      // 4. readJsonS3 calls JSON.parse (string -> object)
      const s3RoundTrip = JSON.parse(JSON.stringify(originalIndex.toJSON()));

      const serializedIndex: SerializedIndex = {
        index: s3RoundTrip, // Object (parsed from S3)
        metadata: {
          itemCount: sampleDocuments.length,
          buildTime: new Date().toISOString(),
          version: "1.0",
        },
      };

      // Should not throw - this was the bug!
      expect(() => {
        loadIndexFromJSON<(typeof sampleDocuments)[0]>(serializedIndex);
      }).not.toThrow();
    });

    it("should throw meaningful error when index data is invalid", () => {
      const invalidSerializedIndex: SerializedIndex = {
        index: { invalid: "structure" } as unknown as string,
        metadata: {
          itemCount: 0,
          buildTime: new Date().toISOString(),
          version: "1.0",
        },
      };

      // MiniSearch.loadJSON should throw when given invalid index structure
      expect(() => {
        loadIndexFromJSON<(typeof sampleDocuments)[0]>(invalidSerializedIndex);
      }).toThrow();
    });
  });

  describe("S3 serialization simulation", () => {
    it("should verify index.toJSON returns object, not string", () => {
      const index = createIndex(sampleDocuments, ["title", "description"]);
      const result = index.toJSON();

      // Verify toJSON returns an object
      expect(typeof result).toBe("object");
      expect(typeof result).not.toBe("string");
    });

    it("should verify S3 read returns parsed object, not string", () => {
      const index = createIndex(sampleDocuments, ["title", "description"]);

      // Simulate the S3 flow
      const buildResult = {
        index: index.toJSON(),
        metadata: {
          itemCount: sampleDocuments.length,
          buildTime: new Date().toISOString(),
          version: "1.0",
        },
      };

      // Simulate S3 write (stringify)
      const s3Content = JSON.stringify(buildResult, null, 2);

      // Simulate S3 read (parse)
      const parsedContent = JSON.parse(s3Content) as SerializedIndex;

      // After S3 read, index is an OBJECT (because JSON.parse recursively parses)
      expect(typeof parsedContent.index).toBe("object");
      expect(typeof parsedContent.index).not.toBe("string");

      // The fix ensures loadIndexFromJSON handles this object correctly
      expect(() => {
        loadIndexFromJSON<(typeof sampleDocuments)[0]>(parsedContent);
      }).not.toThrow();
    });

    it("should handle full S3 round-trip without throwing", () => {
      const index = createIndex(sampleDocuments, ["title", "description"]);

      // Complete simulation of the real flow
      const buildResult: SerializedIndex = {
        index: index.toJSON(),
        metadata: {
          itemCount: sampleDocuments.length,
          buildTime: new Date().toISOString(),
          version: "1.0",
        },
      };

      // S3 write -> S3 read
      const afterS3 = JSON.parse(JSON.stringify(buildResult)) as SerializedIndex;

      // Load should work without "[object Object]" error
      const loadedIndex = loadIndexFromJSON<(typeof sampleDocuments)[0]>(afterS3);
      expect(loadedIndex).toBeDefined();
      expect(loadedIndex.documentCount).toBe(sampleDocuments.length);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty index", () => {
      const emptyIndex = new MiniSearch<(typeof sampleDocuments)[0]>({
        fields: ["title", "description"],
        storeFields: ["id", "title", "description"],
        idField: "id",
      });
      // Don't add any documents

      const serializedIndex: SerializedIndex = {
        index: emptyIndex.toJSON(),
        metadata: {
          itemCount: 0,
          buildTime: new Date().toISOString(),
          version: "1.0",
        },
      };

      // Should not throw
      const loadedIndex = loadIndexFromJSON<(typeof sampleDocuments)[0]>(serializedIndex);
      expect(loadedIndex.documentCount).toBe(0);
    });

    it("should handle large index serialization", () => {
      // Create 100 documents
      const manyDocs = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        title: `Document ${i}`,
        description: `Description for document ${i}`,
      }));

      const index = createIndex(manyDocs, ["title", "description"]);

      // Simulate S3 round-trip
      const serializedIndex: SerializedIndex = {
        index: JSON.parse(JSON.stringify(index.toJSON())),
        metadata: {
          itemCount: manyDocs.length,
          buildTime: new Date().toISOString(),
          version: "1.0",
        },
      };

      // Should not throw
      const loadedIndex = loadIndexFromJSON<(typeof manyDocs)[0]>(serializedIndex);
      expect(loadedIndex.documentCount).toBe(manyDocs.length);
    });

    it("should handle special characters in content without corruption", () => {
      const specialCharDocs = [
        { id: "1", title: "C++ Programming", description: "Learn C++ basics" },
        { id: "2", title: "Node.js & React", description: "Full-stack JavaScript" },
        { id: "3", title: 'SQL "Injection" Prevention', description: "Security best practices" },
      ];

      const index = createIndex(specialCharDocs, ["title", "description"]);

      // Simulate S3 round-trip
      const serializedIndex: SerializedIndex = {
        index: JSON.parse(JSON.stringify(index.toJSON())),
        metadata: {
          itemCount: specialCharDocs.length,
          buildTime: new Date().toISOString(),
          version: "1.0",
        },
      };

      // Should not throw and should preserve document count
      const loadedIndex = loadIndexFromJSON<(typeof specialCharDocs)[0]>(serializedIndex);
      expect(loadedIndex.documentCount).toBe(specialCharDocs.length);
    });
  });
});
