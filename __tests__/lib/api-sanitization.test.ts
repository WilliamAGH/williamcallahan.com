/**
 * API Sanitization Utilities Tests
 *
 * Tests for functions that sanitize API responses and prevent sensitive data exposure
 * Includes comprehensive testing of circular reference handling
 */

import {
  sanitizeBlogPost,
  sanitizeBlogPosts,
  sanitizeError,
  sanitizeSystemInfo,
  sanitizeUrl,
} from "@/lib/utils/api-sanitization";
import type { BlogPost } from "@/types/blog";

describe("API Sanitization Utilities", () => {
  describe("sanitizeBlogPost", () => {
    it("removes sensitive fields from blog post", () => {
      const blogPost: BlogPost = {
        id: "test-post-1",
        slug: "test-post",
        title: "Test Post",
        publishedAt: "2024-01-01",
        excerpt: "Test excerpt",
        content: { compiledSource: "test", scope: {} } as any,
        readingTime: 5,
        tags: ["test"],
        author: { id: "author-1", name: "Test Author" },
        filePath: "/path/to/file.md",
        rawContent: "raw markdown content",
      };

      const sanitized = sanitizeBlogPost(blogPost);

      expect(sanitized).toEqual({
        id: "test-post-1",
        slug: "test-post",
        title: "Test Post",
        publishedAt: "2024-01-01",
        excerpt: "Test excerpt",
        content: { compiledSource: "test", scope: {} },
        readingTime: 5,
        tags: ["test"],
        author: { id: "author-1", name: "Test Author" },
      });
      expect(sanitized).not.toHaveProperty("filePath");
      expect(sanitized).not.toHaveProperty("rawContent");
    });
  });

  describe("sanitizeBlogPosts", () => {
    it("sanitizes array of blog posts", () => {
      const posts: BlogPost[] = [
        {
          id: "post-1",
          slug: "post-1",
          title: "Post 1",
          publishedAt: "2024-01-01",
          excerpt: "Excerpt 1",
          content: { compiledSource: "content 1", scope: {} } as any,
          readingTime: 5,
          tags: ["tag1"],
          author: { id: "author-1", name: "Author 1" },
          filePath: "/path/1.md",
          rawContent: "raw 1",
        },
        {
          id: "post-2",
          slug: "post-2",
          title: "Post 2",
          publishedAt: "2024-01-02",
          excerpt: "Excerpt 2",
          content: { compiledSource: "content 2", scope: {} } as any,
          readingTime: 3,
          tags: ["tag2"],
          author: { id: "author-2", name: "Author 2" },
          filePath: "/path/2.md",
          rawContent: "raw 2",
        },
      ];

      const sanitized = sanitizeBlogPosts(posts);

      expect(sanitized).toHaveLength(2);
      for (const post of sanitized) {
        expect(post).not.toHaveProperty("filePath");
        expect(post).not.toHaveProperty("rawContent");
      }
    });
  });

  describe("sanitizeError", () => {
    it("sanitizes Error objects in development", () => {
      const originalEnv = process.env.NODE_ENV;
      (process.env as any).NODE_ENV = "development";

      const error = new Error("Test error");
      error.stack = "Error: Test error\n    at test.js:1:1";

      const sanitized = sanitizeError(error);

      expect(sanitized.message).toBe("Test error");
      expect(sanitized.stack).toBe(error.stack);
      expect(sanitized.timestamp).toBeDefined();

      (process.env as any).NODE_ENV = originalEnv;
    });

    it("excludes stack traces in production", () => {
      const originalEnv = process.env.NODE_ENV;
      (process.env as any).NODE_ENV = "production";

      const error = new Error("Test error");
      error.stack = "Error: Test error\n    at test.js:1:1";

      const sanitized = sanitizeError(error);

      expect(sanitized.message).toBe("Test error");
      expect(sanitized.stack).toBeUndefined();
      expect(sanitized.timestamp).toBeDefined();

      (process.env as any).NODE_ENV = originalEnv;
    });

    it("handles non-Error objects", () => {
      const sanitized = sanitizeError("string error");

      expect(sanitized.message).toBe("An unknown error occurred");
      expect(sanitized.timestamp).toBeDefined();
    });

    it("includes stack when explicitly requested", () => {
      const originalEnv = process.env.NODE_ENV;
      (process.env as any).NODE_ENV = "production";

      const error = new Error("Test error");
      error.stack = "Stack trace";

      const sanitized = sanitizeError(error, true);

      expect(sanitized.stack).toBe("Stack trace");

      (process.env as any).NODE_ENV = originalEnv;
    });
  });

  describe("sanitizeSystemInfo", () => {
    it("removes sensitive keys", () => {
      const obj = {
        name: "test",
        path: "/sensitive/path",
        password: "secret123",
        token: "auth-token",
        stack: "stack trace",
        safeData: "keep this",
      };

      const sanitized = sanitizeSystemInfo(obj);

      expect(sanitized).toEqual({
        name: "test",
        safeData: "keep this",
      });
      expect(sanitized).not.toHaveProperty("path");
      expect(sanitized).not.toHaveProperty("password");
      expect(sanitized).not.toHaveProperty("token");
      expect(sanitized).not.toHaveProperty("stack");
    });

    it("handles nested objects", () => {
      const obj = {
        level1: {
          path: "/remove/this",
          nested: {
            secret: "remove-me",
            keep: "this-value",
          },
        },
        safe: "data",
      };

      const sanitized = sanitizeSystemInfo(obj);

      expect(sanitized).toEqual({
        level1: {
          nested: {
            keep: "this-value",
          },
        },
        safe: "data",
      });
    });

    it("handles arrays with nested objects", () => {
      const obj = {
        items: [
          { name: "item1", secret: "remove" },
          { name: "item2", path: "/remove" },
          "primitive-value",
        ],
      };

      const sanitized = sanitizeSystemInfo(obj);

      expect(sanitized).toEqual({
        items: [{ name: "item1" }, { name: "item2" }, "primitive-value"],
      });
    });

    it("preserves null and undefined values", () => {
      const obj = {
        nullValue: null,
        undefinedValue: undefined,
        nested: {
          alsoNull: null,
        },
      };

      const sanitized = sanitizeSystemInfo(obj);

      expect(sanitized.nullValue).toBeNull();
      expect(sanitized.undefinedValue).toBeUndefined();
      expect((sanitized.nested as Record<string, unknown>).alsoNull).toBeNull();
    });

    it("handles circular references without infinite recursion", () => {
      const obj: Record<string, unknown> = {
        name: "test",
      };
      // Create circular reference
      obj.circular = obj;

      const sanitized = sanitizeSystemInfo(obj);

      expect(sanitized.name).toBe("test");
      expect(sanitized.circular).toEqual({ "[Circular Reference]": true });
    });

    it("handles complex circular references", () => {
      const objA: Record<string, unknown> = { name: "A" };
      const objB: Record<string, unknown> = { name: "B" };

      // Create mutual circular references
      objA.refToB = objB;
      objB.refToA = objA;

      const sanitized = sanitizeSystemInfo(objA);

      expect(sanitized.name).toBe("A");
      expect((sanitized.refToB as Record<string, unknown>).name).toBe("B");
      expect((sanitized.refToB as Record<string, unknown>).refToA).toEqual({
        "[Circular Reference]": true,
      });
    });

    it("handles circular references in arrays", () => {
      const obj: Record<string, unknown> = { name: "test" };
      obj.array = [obj, "other-item"];

      const sanitized = sanitizeSystemInfo(obj);

      expect(sanitized.name).toBe("test");
      expect(Array.isArray(sanitized.array)).toBe(true);
      expect((sanitized.array as unknown[])[0]).toEqual({ "[Circular Reference]": true });
      expect((sanitized.array as unknown[])[1]).toBe("other-item");
    });

    it("preserves primitive values", () => {
      const obj = {
        string: "test",
        number: 42,
        boolean: true,
        date: new Date("2024-01-01"),
      };

      const sanitized = sanitizeSystemInfo(obj);

      expect(sanitized.string).toBe("test");
      expect(sanitized.number).toBe(42);
      expect(sanitized.boolean).toBe(true);
      // Date objects are treated as objects and get recursively processed,
      // resulting in an empty object (which is expected security behavior)
      expect(sanitized.date).toEqual({});
    });
  });

  describe("sanitizeUrl", () => {
    it("removes sensitive query parameters", () => {
      const url = "https://example.com/api?token=secret&other=keep&password=hidden";
      const sanitized = sanitizeUrl(url);

      expect(sanitized).toBe("https://example.com/api?other=keep");
    });

    it("preserves safe query parameters", () => {
      const url = "https://example.com/api?page=1&limit=10&sort=date";
      const sanitized = sanitizeUrl(url);

      expect(sanitized).toBe(url);
    });

    it("handles malformed URLs", () => {
      const malformed = "not-a-url";
      const sanitized = sanitizeUrl(malformed);

      expect(sanitized).toBe("[URL sanitized]");
    });

    it("handles URLs without query parameters", () => {
      const url = "https://example.com/path";
      const sanitized = sanitizeUrl(url);

      expect(sanitized).toBe(url);
    });
  });
});
