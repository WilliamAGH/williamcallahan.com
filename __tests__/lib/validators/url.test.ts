import { sanitizePath, IMAGE_SECURITY_HEADERS } from "@/lib/validators/url";

describe("URL Validation Functions", () => {
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
    it("should have correct security headers", () => {
      expect(IMAGE_SECURITY_HEADERS).toEqual({
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
        "Content-Security-Policy":
          "default-src 'none'; img-src 'self' data: https:; style-src 'unsafe-inline'",
      });
    });
  });
});
