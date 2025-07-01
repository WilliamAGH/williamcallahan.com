/**
 * Utility Functions Tests
 *
 * Tests core utility functions for formatting, validation, and string manipulation
 * Includes comprehensive testing of edge cases and failure modes
 */

import {
  formatMultiple,
  formatPercentage,
  formatDate,
  isValidUrl,
  extractDomain,
  truncateText,
  randomString,
} from "@/lib/utils";

describe("formatMultiple", () => {
  it("formats numbers correctly", () => {
    expect(formatMultiple(2.5)).toBe("2.5x");
    expect(formatMultiple(0)).toBe("0x");
    expect(formatMultiple(1.0)).toBe("1.0x");
  });

  it("handles undefined/null", () => {
    expect(formatMultiple(undefined)).toBe("N/A");
    expect(formatMultiple(null)).toBe("N/A");
  });
});

describe("formatPercentage", () => {
  it("formats numbers correctly", () => {
    expect(formatPercentage(25.5, 1)).toBe("25.5%"); // Specify 1 decimal place
    expect(formatPercentage(0, 0)).toBe("0%"); // Specify 0 decimal places
    expect(formatPercentage(100, 1)).toBe("100.0%"); // Specify 1 decimal place
  });

  it("handles undefined/null", () => {
    expect(formatPercentage(undefined)).toBe("N/A");
    expect(formatPercentage(null)).toBe("N/A");
  });
});

describe("formatDate", () => {
  // Mock timezone to ensure consistent behavior
  const realDate = global.Date;
  beforeAll(() => {
    global.Date = class extends realDate {
      constructor(date?: number | string | Date) {
        super(date || "2024-03-14T12:00:00Z");
      }
    } as DateConstructor;
  });

  afterAll(() => {
    global.Date = realDate;
  });

  it("should format an ISO string with PT offset correctly", () => {
    // March 14, 2024 00:00:00 PST (-08:00)
    expect(formatDate("2024-03-14T00:00:00-08:00")).toBe("March 14, 2024");
  });

  it("should format an ISO string with UTC offset correctly for PT display", () => {
    // March 14, 2024 08:00:00 UTC is March 14, 2024 00:00:00 PST
    expect(formatDate("2024-03-14T08:00:00Z")).toBe("March 14, 2024");
  });

  it("should format a date during PDT correctly", () => {
    // July 14, 2024 00:00:00 PDT (-07:00)
    expect(formatDate("2024-07-14T00:00:00-07:00")).toBe("July 14, 2024");
  });

  // This test case demonstrates the old behavior when passing date-only strings
  // It's kept here for clarity but shows why date-only strings are problematic
  it("should show previous day for date-only string (interpreted as UTC midnight)", () => {
    expect(formatDate("2024-03-14")).toBe("March 13, 2024");
  });

  it("should handle invalid date string", () => {
    // Suppress console.warn during this test
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(formatDate("invalid-date")).toBe("Invalid Date");
    expect(warnSpy).toHaveBeenCalledWith("Invalid date string passed to formatDate: invalid-date");
    warnSpy.mockRestore();
  });
});

describe("isValidUrl", () => {
  it("validates URLs correctly", () => {
    expect(isValidUrl("https://example.com")).toBe(true);
    expect(isValidUrl("http://localhost:3000")).toBe(true);
    expect(isValidUrl("not a url")).toBe(false);
    expect(isValidUrl("")).toBe(false);
  });
});

describe("extractDomain", () => {
  it("extracts domains from URLs", () => {
    expect(extractDomain("https://www.example.com")).toBe("example.com");
    expect(extractDomain("http://sub.example.com")).toBe("sub.example.com");
  });

  it("handles company names", () => {
    expect(extractDomain("Example Company")).toBe("examplecompany");
    expect(extractDomain("Company Name LLC")).toBe("companyname"); // Updated expectation
  });
});

describe("truncateText", () => {
  it("truncates long text", () => {
    expect(truncateText("This is a long text", 7)).toBe("This is...");
    expect(truncateText("Short", 10)).toBe("Short");
  });

  it("handles empty strings", () => {
    expect(truncateText("", 5)).toBe("");
  });
});

describe("randomString", () => {
  it("generates strings of correct length", () => {
    expect(randomString(5).length).toBe(5);
    expect(randomString(10).length).toBe(10);
  });

  it("generates different strings", () => {
    const str1 = randomString(5);
    const str2 = randomString(5);
    expect(str1).not.toBe(str2);
  });

  describe("formatMultiple - extended scenarios", () => {
    it("handles negative numbers", () => {
      expect(formatMultiple(-1.5)).toBe("-1.5x");
    });

    it("handles high precision floats", () => {
      expect(formatMultiple(1.23456)).toBe("1.23456x");
    });

    it("handles extremely large numbers", () => {
      const large = 1e20;
      expect(formatMultiple(large)).toBe("1e+20x");
    });

    it("returns N/A for NaN and Infinity", () => {
      expect(formatMultiple(Number.NaN)).toBe("N/A");
      expect(formatMultiple(Number.POSITIVE_INFINITY)).toBe("N/A");
    });
  });

  describe("formatPercentage - extended scenarios", () => {
    it("handles rounding to one decimal place", () => {
      expect(formatPercentage(33.333, 1)).toBe("33.3%"); // Specify 1 decimal place
    });

    it("handles values over 100%", () => {
      expect(formatPercentage(150, 1)).toBe("150.0%"); // Specify 1 decimal place
    });

    it("returns N/A for NaN and -Infinity", () => {
      expect(formatPercentage(Number.NaN)).toBe("N/A");
      expect(formatPercentage(Number.NEGATIVE_INFINITY)).toBe("N/A");
    });
  });

  describe("formatDate - Date object and DST boundary", () => {
    it("formats JavaScript Date objects correctly", () => {
      const dateObj = new Date("2024-12-31T15:00:00Z");
      expect(formatDate(dateObj)).toBe("December 31, 2024");
    });

    it("handles DST fallback boundary (Nov 3, 2024)", () => {
      // Nov 3, 2024 01:30 PST is 08:30 UTC
      expect(formatDate("2024-11-03T08:30:00Z")).toBe("November 3, 2024");
    });

    it('returns "Invalid Date" for non-string/non-Date inputs', () => {
      expect(formatDate(12345)).toBe("Invalid Date");
    });
  });

  describe("isValidUrl - protocol and malformed inputs", () => {
    it("rejects non-http protocols such as ftp", () => {
      expect(isValidUrl("ftp://example.com")).toBe(false);
    });

    it("rejects malformed URLs missing colon", () => {
      expect(isValidUrl("http//missing-colon.com")).toBe(false);
    });

    it("accepts URLs with query strings and fragments", () => {
      expect(isValidUrl("https://example.com/path?query=1#hash")).toBe(true);
    });

    it("rejects null and undefined values", () => {
      expect(isValidUrl(null as unknown as string)).toBe(false);
      expect(isValidUrl(undefined as unknown as string)).toBe(false);
    });
  });

  describe("extractDomain - ports, paths, and casing", () => {
    it("extracts domain without port", () => {
      expect(extractDomain("https://example.com:8080/path")).toBe("example.com");
    });

    it("handles uppercase domains and www prefix", () => {
      expect(extractDomain("HTTPS://WWW.TEST-DOMAIN.COM")).toBe("test-domain.com");
    });

    it("falls back to raw input for non-URL types", () => {
      expect(extractDomain(12345)).toBe("12345");
    });
  });

  describe("truncateText - edge case behavior", () => {
    it("returns empty string for empty input", () => {
      expect(truncateText("", 5)).toBe("");
    });

    it("handles maxLength shorter than ellipsis", () => {
      expect(truncateText("HelloWorld", 2)).toBe("He...");
    });

    it("returns original string when length equals limit", () => {
      expect(truncateText("Hello", 5)).toBe("Hello");
    });

    it("throws an error for negative maxLength", () => {
      expect(() => truncateText("Test", -1)).toThrow();
    });
  });

  describe("randomString - length, charset, and determinism", () => {
    it("returns empty string for length 0", () => {
      expect(randomString(0)).toBe("");
    });

    it("generates strings matching allowed characters", () => {
      const str = randomString(20);
      expect(str).toMatch(/^[A-Za-z0-9]{20}$/);
    });

    it("produces consistent output when Math.random is mocked", () => {
      const spy = jest.spyOn(Math, "random").mockReturnValue(0.42);
      const s1 = randomString(5);
      const s2 = randomString(5);
      expect(s1).toBe(s2);
      spy.mockRestore();
    });
  });
});
