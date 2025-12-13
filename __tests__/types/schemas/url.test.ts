import {
  safeUrlSchema,
  logoUrlSchema,
  openGraphUrlSchema,
  s3KeySchema,
  safePathSchema,
  assetIdSchema,
} from "@/types/schemas/url";

describe("URL Schema Validation", () => {
  describe("safeUrlSchema", () => {
    it("should accept valid URLs", () => {
      const validUrls = [
        "https://example.com",
        "http://example.com",
        "https://example.com:443",
        "https://example.com/path",
        "https://example.com/path?query=value",
        "https://subdomain.example.com",
      ];

      for (const url of validUrls) {
        expect(() => safeUrlSchema.parse(url)).not.toThrow();
      }
    });

    it("should reject URLs with private IPs", () => {
      const privateUrls = [
        "http://localhost",
        "http://127.0.0.1",
        "http://10.0.0.1",
        "http://172.16.0.1",
        "http://192.168.1.1",
        "http://[::1]",
        "http://[fc00::1]",
        "http://[fd00::1]",
        "http://[::ffff:127.0.0.1]",
        "http://[::ffff:7f00:1]",
        "http://[::ffff:7f000001]",
      ];

      for (const url of privateUrls) {
        const result = safeUrlSchema.safeParse(url);
        // The key security requirement is that these URLs are rejected
        // Error message format varies by Zod version (v4 may use different messages)
        expect(result.success).toBe(false);
      }
    });

    it("should reject non-HTTP(S) protocols", () => {
      const invalidProtocols = [
        "file:///etc/passwd",
        "ftp://example.com",
        "ssh://example.com",
        "javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
      ];

      for (const url of invalidProtocols) {
        expect(() => safeUrlSchema.parse(url)).toThrow();
      }
    });

    it("should reject URLs with credentials", () => {
      const urlsWithCreds = ["https://user:pass@example.com", "http://admin:secret@example.com/path"];

      for (const url of urlsWithCreds) {
        expect(() => safeUrlSchema.parse(url)).toThrow(/not safe/);
      }
    });

    it("should reject URLs with suspicious ports", () => {
      const suspiciousPorts = [
        "http://example.com:22", // SSH
        "http://example.com:23", // Telnet
        "http://example.com:3389", // RDP
        "http://example.com:5432", // PostgreSQL
        "http://example.com:6379", // Redis
      ];

      for (const url of suspiciousPorts) {
        expect(() => safeUrlSchema.parse(url)).toThrow(/not safe/);
      }
    });

    it("should accept allowed ports", () => {
      const allowedPorts = [
        "http://example.com:80",
        "https://example.com:443",
        "http://example.com:8080",
        "http://example.com:3000",
      ];

      for (const url of allowedPorts) {
        expect(() => safeUrlSchema.parse(url)).not.toThrow();
      }
    });
  });

  describe("logoUrlSchema", () => {
    it("should accept valid logo service URLs", () => {
      const validLogoUrls = [
        "https://logo.clearbit.com/example.com",
        "https://www.google.com/s2/favicons?domain=example.com",
        "https://icons.duckduckgo.com/ip3/example.com.ico",
        "https://example.com/favicon.ico",
        "https://example.com/logo.png",
      ];

      for (const url of validLogoUrls) {
        expect(() => logoUrlSchema.parse(url)).not.toThrow();
      }
    });

    it("should inherit safeUrlSchema restrictions", () => {
      // Should reject private IPs
      expect(() => logoUrlSchema.parse("http://localhost/logo.png")).toThrow();

      // Should reject credentials
      expect(() => logoUrlSchema.parse("https://user:pass@example.com/logo.png")).toThrow();
    });
  });

  describe("openGraphUrlSchema", () => {
    it("should accept various website URLs", () => {
      const validUrls = [
        "https://example.com",
        "https://blog.example.com/post/123",
        "https://example.com/about",
        "http://example.com", // HTTP allowed for OpenGraph
      ];

      for (const url of validUrls) {
        expect(() => openGraphUrlSchema.parse(url)).not.toThrow();
      }
    });

    it("should inherit safeUrlSchema restrictions", () => {
      // Should reject private IPs
      expect(() => openGraphUrlSchema.parse("http://192.168.1.1")).toThrow();

      // Should reject file protocol
      expect(() => openGraphUrlSchema.parse("file:///etc/passwd")).toThrow();
    });
  });

  describe("s3KeySchema", () => {
    it("should accept valid S3 keys", () => {
      const validKeys = [
        "images/logos/logo.png",
        "images/opengraph/preview.jpg",
        "images/social-avatars/twitter/user.png",
        "assets/document.pdf",
        "a1b2c3d4e5f6789012345678901234567890123456789012345678901234.png",
      ];

      for (const key of validKeys) {
        expect(() => s3KeySchema.parse(key)).not.toThrow();
      }
    });

    it("should reject path traversal attempts", () => {
      const pathTraversalKeys = [
        "../../../etc/passwd",
        "images/../../secrets.txt",
        "logos/../../../",
        "./../config.json",
        "images/./../../admin",
      ];

      for (const key of pathTraversalKeys) {
        expect(() => s3KeySchema.parse(key)).toThrow(/Invalid S3 key format/);
      }
    });

    it("should reject absolute paths", () => {
      const absolutePaths = ["/etc/passwd", "/root/.ssh/id_rsa", "/var/log/secrets"];

      for (const path of absolutePaths) {
        expect(() => s3KeySchema.parse(path)).toThrow(/Invalid S3 key format/);
      }
    });

    it("should reject keys not matching patterns", () => {
      const invalidKeys = [
        "random/path/file.txt",
        "images/file.txt", // missing subfolder
        "../../etc/passwd",
        "not-a-valid-key",
      ];

      for (const key of invalidKeys) {
        expect(() => s3KeySchema.parse(key)).toThrow(/Invalid S3 key format/);
      }
    });

    it("should handle specific patterns", () => {
      // Should accept hash-based names
      expect(() => s3KeySchema.parse("a1b2c3d4e5f6789012345678901234567890123456789012345678901234.png")).not.toThrow();

      // Should reject patterns with special characters not in allowed set
      expect(() => s3KeySchema.parse("images/logos/file@name.png")).toThrow();
    });
  });

  describe("safePathSchema", () => {
    it("should sanitize paths correctly", () => {
      const testCases = [
        { input: "normal/path.jpg", expected: "normal/path.jpg" },
        { input: "../../../etc/passwd", expected: "etc/passwd" },
        { input: "./././file.txt", expected: "file.txt" },
        { input: "path/../file.txt", expected: "path/file.txt" }, // Only removes .. and ., doesn't resolve
        { input: "/absolute/path", expected: "absolute/path" },
        { input: "path//to///file", expected: "path/to/file" },
      ];

      for (const { input, expected } of testCases) {
        expect(safePathSchema.parse(input)).toBe(expected);
      }
    });

    it("should handle edge cases", () => {
      expect(safePathSchema.parse("")).toBe("");
      expect(safePathSchema.parse(".")).toBe("");
      expect(safePathSchema.parse("..")).toBe("");
      expect(safePathSchema.parse("/")).toBe("");
    });
  });

  describe("assetIdSchema", () => {
    it("should accept valid asset IDs", () => {
      const validIds = [
        "550e8400-e29b-41d4-a716-446655440000", // UUID v4 with hyphens
        "550e8400e29b41d4a716446655440000", // UUID without hyphens
        "550E8400-E29B-41D4-A716-446655440000", // UUID uppercase
        "550e8400e29b41d4a716446655440000", // UUID lowercase no hyphens
      ];

      for (const id of validIds) {
        expect(() => assetIdSchema.parse(id)).not.toThrow();
      }
    });

    it("should reject non-UUID asset IDs", () => {
      const invalidIds = [
        "simple-id-123",
        "asset_2024_01_15",
        "logo.png",
        "../secret",
        "not-a-uuid",
        "550e8400-e29b-41d4-a716", // Too short
        "550e8400-e29b-41d4-a716-446655440000-extra", // Too long
      ];

      for (const id of invalidIds) {
        expect(() => assetIdSchema.parse(id)).toThrow(/Invalid asset ID format/);
      }
    });

    it("should handle case insensitivity", () => {
      const mixedCaseUuid = "550E8400-e29b-41D4-a716-446655440000";
      expect(() => assetIdSchema.parse(mixedCaseUuid)).not.toThrow();
    });

    it("should reject malformed UUIDs", () => {
      const malformedIds = [
        "550e8400-e29b-41d4-a716-44665544000g", // Invalid character 'g'
        "550e8400-e29b-41d4-a716-4466554400", // Too short
        "550e8400--e29b-41d4-a716-446655440000", // Double hyphen
      ];

      for (const id of malformedIds) {
        expect(() => assetIdSchema.parse(id)).toThrow(/Invalid asset ID format/);
      }
    });
  });
});
