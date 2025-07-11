/**
 * SEO Utilities Tests
 *
 * Tests SEO utility functions for URL formatting, image type detection,
 * and date formatting with Pacific Time zone handling
 *
 * @jest-environment node
 */

import { ensureAbsoluteUrl, getImageTypeFromUrl, formatSeoDate } from "@/lib/seo/utils";
import { NEXT_PUBLIC_SITE_URL } from "@/lib/constants";
import { isPacificDateString } from "@/types/seo";

jest.mock("@/lib/constants/client", () => ({
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
}));

describe("SEO Utilities", () => {
  describe("ensureAbsoluteUrl", () => {
    it("should return the same URL if already absolute", () => {
      const url = "https://example.com/image.jpg";
      expect(ensureAbsoluteUrl(url)).toBe(url);
    });

    it("should prepend site URL to relative paths", () => {
      const path = "/images/photo.jpg";
      expect(ensureAbsoluteUrl(path)).toBe(`${NEXT_PUBLIC_SITE_URL}${path}`);
    });

    it("should handle paths without leading slash", () => {
      const path = "images/photo.jpg";
      expect(ensureAbsoluteUrl(path)).toBe(`${NEXT_PUBLIC_SITE_URL}/${path}`);
    });
  });

  describe("getImageTypeFromUrl", () => {
    it("should return correct MIME type for SVG", () => {
      expect(getImageTypeFromUrl("logo.svg")).toBe("image/svg+xml");
    });

    it("should return correct MIME type for JPEG", () => {
      expect(getImageTypeFromUrl("photo.jpg")).toBe("image/jpeg");
      expect(getImageTypeFromUrl("photo.jpeg")).toBe("image/jpeg");
    });

    it("should return correct MIME type for PNG", () => {
      expect(getImageTypeFromUrl("image.png")).toBe("image/png");
    });

    it("should handle URLs with query parameters", () => {
      expect(getImageTypeFromUrl("photo.jpg?width=100")).toBe("image/jpeg");
    });

    it("should handle URLs with fragments", () => {
      expect(getImageTypeFromUrl("photo.jpg#preview")).toBe("image/jpeg");
    });
  });

  describe("formatSeoDate", () => {
    beforeAll(() => {
      // Mock timezone to America/Los_Angeles
      process.env.TZ = "America/Los_Angeles";
    });

    it("should format date string with Pacific Time offset during standard time", () => {
      // January 1st (PST)
      const date = new Date("2025-01-01T12:00:00");
      const formatted = formatSeoDate(date);
      expect(isPacificDateString(formatted)).toBe(true);
      expect(formatted).toMatch(/-08:00$/);
    });

    it("should format date string with Pacific Time offset during daylight savings", () => {
      // July 1st (PDT)
      const date = new Date("2025-07-01T12:00:00");
      const formatted = formatSeoDate(date);
      expect(isPacificDateString(formatted)).toBe(true);
      expect(formatted).toMatch(/-07:00$/);
    });

    it("should handle string input", () => {
      const dateStr = "2025-02-10T10:54:28";
      const formatted = formatSeoDate(dateStr);
      expect(isPacificDateString(formatted)).toBe(true);
    });

    it("should handle undefined by using current time", () => {
      const formatted = formatSeoDate(undefined);
      expect(isPacificDateString(formatted)).toBe(true);
    });

    it("should preserve hour, minute, and second values", () => {
      const date = new Date("2025-01-01T15:30:45");
      const formatted = formatSeoDate(date);
      expect(formatted).toMatch(/T15:30:45-0[87]:00$/);
    });

    it("should handle date-only strings", () => {
      const dateStr = "2025-02-10";
      const formatted = formatSeoDate(dateStr);
      expect(isPacificDateString(formatted)).toBe(true);
      expect(formatted).toMatch(/T00:00:00-08:00$/);
    });
  });

  describe("isPacificDateString", () => {
    it("should validate correct Pacific Time format during standard time", () => {
      expect(isPacificDateString("2025-01-01T12:00:00-08:00")).toBe(true);
    });

    it("should validate correct Pacific Time format during daylight savings", () => {
      expect(isPacificDateString("2025-07-01T12:00:00-07:00")).toBe(true);
    });

    it("should reject invalid formats", () => {
      expect(isPacificDateString("2025-01-01")).toBe(false);
      expect(isPacificDateString("2025-01-01T12:00:00Z")).toBe(false);
      expect(isPacificDateString("2025-01-01T12:00:00+00:00")).toBe(false);
    });

    it("should reject invalid timezone offsets", () => {
      expect(isPacificDateString("2025-01-01T12:00:00-05:00")).toBe(false);
      expect(isPacificDateString("2025-01-01T12:00:00-09:00")).toBe(false);
    });
  });

  // Additional edge-case and failure-mode tests for SEO utilities using Jest
  describe("ensureAbsoluteUrl – edge and failure cases", () => {
    it("returns non-http protocols unchanged", () => {
      const ftpUrl = "ftp://example.com/resource";
      expect(ensureAbsoluteUrl(ftpUrl)).toBe(ftpUrl);
    });

    it("treats empty string as root relative path", () => {
      const empty = "";
      expect(ensureAbsoluteUrl(empty)).toBe(`${NEXT_PUBLIC_SITE_URL}/`);
    });

    it("preserves data URIs intact", () => {
      const dataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA";
      expect(ensureAbsoluteUrl(dataUri)).toBe(dataUri);
    });
  });

  describe("getImageTypeFromUrl – uppercase and unsupported cases", () => {
    it("handles uppercase file extensions", () => {
      expect(getImageTypeFromUrl("ICON.SVG")).toBe("image/svg+xml");
      expect(getImageTypeFromUrl("PHOTO.JPG")).toBe("image/jpeg");
    });

    it("returns undefined for unsupported extensions", () => {
      expect(getImageTypeFromUrl("file.txt")).toBeUndefined();
      expect(getImageTypeFromUrl("archive.tar.gz")).toBeUndefined();
    });
  });

  describe("formatSeoDate – failure modes and DST boundary transitions", () => {
    it("throws when passed an invalid date string", () => {
      expect(() => formatSeoDate("not-a-date")).toThrow();
    });

    it("correctly shifts offset at DST start boundary", () => {
      // Just before DST start (PST)
      const before = new Date("2025-03-09T01:59:59");
      const formattedBefore = formatSeoDate(before);
      expect(formattedBefore).toMatch(/-08:00$/);

      // Just after DST start (PDT)
      const after = new Date("2025-03-09T03:00:00");
      const formattedAfter = formatSeoDate(after);
      expect(formattedAfter).toMatch(/-07:00$/);
    });

    it("handles numeric timestamp inputs by throwing or coercing", () => {
      expect(() => formatSeoDate(1620000000000 as any)).toThrow();
    });
  });

  describe("isPacificDateString – non-string and malformed inputs", () => {
    it("rejects non-string inputs", () => {
      expect(isPacificDateString(12345 as any)).toBe(false);
      expect(isPacificDateString(null as any)).toBe(false);
      expect(isPacificDateString(undefined as any)).toBe(false);
    });

    it("rejects missing leading zero in offset", () => {
      expect(isPacificDateString("2025-01-01T12:00:00-8:00")).toBe(false);
    });

    it("rejects totally malformed strings", () => {
      expect(isPacificDateString("foo-bar")).toBe(false);
      expect(isPacificDateString("2025/01/01 12:00:00")).toBe(false);
    });
  });
});
