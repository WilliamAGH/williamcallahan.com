import {
  validateLogoUrl,
  validateOpenGraphUrl,
  validateS3Key,
  sanitizePath,
  IMAGE_RATE_LIMITS,
  IMAGE_SECURITY_HEADERS,
} from "@/lib/validators/url";

describe("URL Validation Functions", () => {
  describe("validateLogoUrl", () => {
    it("should validate logo URLs successfully", async () => {
      const validUrls = [
        "https://logo.clearbit.com/example.com",
        "https://www.google.com/s2/favicons?domain=example.com",
        "https://example.com/logo.png",
      ];

      for (const url of validUrls) {
        const result = await validateLogoUrl(url);
        expect(result.success).toBe(true);
        expect(result.data).toBe(url);
        expect(result.error).toBeUndefined();
      }
    });

    it("should reject invalid logo URLs", async () => {
      const invalidUrls = [
        "http://localhost/logo.png",
        "file:///etc/passwd",
        "https://user:pass@example.com/logo.png",
        "not-a-url",
      ];

      for (const url of invalidUrls) {
        const result = await validateLogoUrl(url);
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.data).toBeUndefined();
      }
    });

    it("should provide meaningful error messages", async () => {
      const result = await validateLogoUrl("http://127.0.0.1/logo.png");
      expect(result.success).toBe(false);
      expect(result.error).toContain("not safe");
    });
  });

  describe("validateOpenGraphUrl", () => {
    it("should validate OpenGraph URLs successfully", async () => {
      const validUrls = [
        "https://example.com",
        "https://blog.example.com/article",
        "http://example.com/page", // HTTP is allowed for OpenGraph
      ];

      for (const url of validUrls) {
        const result = await validateOpenGraphUrl(url);
        expect(result.success).toBe(true);
        expect(result.data).toBe(url);
        expect(result.error).toBeUndefined();
      }
    });

    it("should reject invalid OpenGraph URLs", async () => {
      const invalidUrls = ["http://192.168.1.1", "javascript:alert(1)", "ftp://example.com", ""];

      for (const url of invalidUrls) {
        const result = await validateOpenGraphUrl(url);
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.data).toBeUndefined();
      }
    });
  });

  describe("validateS3Key", () => {
    it("should validate safe S3 keys", () => {
      const validKeys = [
        "images/logos/logo.png",
        "images/opengraph/preview.jpg",
        "images/social-avatars/twitter/user.png",
        "assets/document.pdf",
        "a1b2c3d4e5f6789012345678901234567890123456789012345678901234.png",
      ];

      for (const key of validKeys) {
        expect(validateS3Key(key)).toBe(true);
      }
    });

    it("should reject unsafe S3 keys", () => {
      const invalidKeys = ["../../../etc/passwd", "/root/.ssh/id_rsa", "images/../../../secrets", "file\x00.txt"];

      for (const key of invalidKeys) {
        expect(validateS3Key(key)).toBe(false);
      }
    });
  });

  describe("sanitizePath", () => {
    it("should sanitize paths correctly", () => {
      expect(sanitizePath("normal/path.jpg")).toBe("normal/path.jpg");
      expect(sanitizePath("../../../etc/passwd")).toBe("etc/passwd");
      expect(sanitizePath("/absolute/path")).toBe("absolute/path");
      expect(sanitizePath("path/../file.txt")).toBe("path/file.txt");
    });

    it("should handle directory traversal removal", () => {
      expect(sanitizePath("../../secrets")).toBe("secrets");
      expect(sanitizePath("./././file")).toBe("file");
      expect(sanitizePath("foo/../bar")).toBe("foo/bar");
    });

    it("should normalize slashes", () => {
      expect(sanitizePath("path//to///file")).toBe("path/to/file");
      expect(sanitizePath("///leading/slashes")).toBe("leading/slashes");
      expect(sanitizePath("trailing/slash/")).toBe("trailing/slash/"); // safePathSchema doesn't remove trailing slashes
    });

    it("should normalize multiple slashes", () => {
      expect(sanitizePath("path//to///file")).toBe("path/to/file");
      expect(sanitizePath("//leading/slashes")).toBe("leading/slashes");
    });

    it("should handle empty and special inputs", () => {
      expect(sanitizePath("")).toBe("");
      expect(sanitizePath(".")).toBe("");
      expect(sanitizePath("..")).toBe("");
      expect(sanitizePath("/")).toBe("");
    });
  });

  describe("Constants", () => {
    it("should have correct rate limit configuration", () => {
      expect(IMAGE_RATE_LIMITS).toEqual({
        perIp: {
          windowMs: 60 * 1000,
          maxRequests: 30,
        },
        perDomain: {
          windowMs: 60 * 1000,
          maxRequests: 10,
        },
      });
    });

    it("should have correct security headers", () => {
      expect(IMAGE_SECURITY_HEADERS).toEqual({
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
        "Content-Security-Policy": "default-src 'none'; img-src 'self' data: https:; style-src 'unsafe-inline'",
      });
    });
  });
});
