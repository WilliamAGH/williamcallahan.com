/**
 * Text Truncation with Gradient Logic
 * @module lib/seo/text-truncation
 * @description
 * Provides intelligent text truncation that gradually becomes more aggressive
 * as text approaches hard limits. Includes Unicode-safe string operations.
 */

import type { TruncationOptions, TruncationResult, TruncationMetrics } from "@/types/seo";

/**
 * Unicode-safe string operations using Intl.Segmenter
 * Handles emojis, combining characters, and international text correctly
 */
class SafeString {
  private text: string;
  private segments: string[];
  private segmenter: Intl.Segmenter | null = null;

  constructor(text: string, locale = "en") {
    this.text = text;

    // Use Intl.Segmenter for accurate grapheme cluster segmentation
    if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
      try {
        this.segmenter = new Intl.Segmenter(locale, { granularity: "grapheme" });
        const segments = Array.from(this.segmenter.segment(text));
        this.segments = segments.map((s) => s.segment);
      } catch (error) {
        console.warn("Intl.Segmenter failed, using fallback:", error);
        this.segments = Array.from(text);
      }
    } else {
      // Fallback for older browsers
      this.segments = Array.from(text);
    }
  }

  get length(): number {
    return this.segments.length;
  }

  slice(start: number, end?: number): string {
    return this.segments.slice(start, end).join("");
  }

  findWordBoundary(position: number, direction: "before" | "after"): number {
    let charPos = 0;
    for (let i = 0; i < Math.min(position, this.segments.length); i++) {
      charPos += this.segments[i]?.length ?? 0;
    }

    const text = this.text;

    if (direction === "before") {
      for (let i = charPos - 1; i >= 0; i--) {
        const char = text[i];
        if (char && /\s/.test(char)) {
          return this.getGraphemePosition(i);
        }
      }
      return 0;
    } else {
      for (let i = charPos; i < text.length; i++) {
        const char = text[i];
        if (char && /\s/.test(char)) {
          return this.getGraphemePosition(i + 1);
        }
      }
      return this.length;
    }
  }

  private getGraphemePosition(charIndex: number): number {
    let currentCharPos = 0;
    for (let i = 0; i < this.segments.length; i++) {
      if (currentCharPos >= charIndex) {
        return i;
      }
      currentCharPos += this.segments[i]?.length ?? 0;
    }
    return this.segments.length;
  }

  toString(): string {
    return this.text;
  }

  words(): string[] {
    return this.text.split(/\s+/).filter((word) => word.length > 0);
  }

  get isUnicodeAware(): boolean {
    return this.segmenter !== null;
  }
}

/**
 * Common filler words to remove in light truncation
 */
const FILLER_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "up",
  "about",
  "into",
  "through",
  "after",
  "over",
  "between",
  "out",
  "against",
  "during",
  "without",
  "before",
  "under",
  "around",
  "among",
]);

/**
 * Main gradient truncation function
 * Intelligently truncates text based on how far over the soft limit it is
 */
export function gradientTruncate(text: string | null | undefined, options: TruncationOptions): TruncationResult {
  const startTime = performance.now();

  // Handle empty/null input
  if (!text || typeof text !== "string") {
    return createResult("", String(text ?? ""), false, "none", 0, 0, startTime, true, 0, 0);
  }

  // Normalize and create safe string
  const normalized = text.normalize("NFC").trim();
  const safeString = new SafeString(normalized, options.locale);

  // No truncation needed
  if (safeString.length <= options.softLimit) {
    return createResult(
      normalized,
      normalized,
      false,
      "none",
      safeString.length,
      0,
      startTime,
      safeString.isUnicodeAware,
      options.softLimit,
      options.hardLimit ?? options.softLimit + 20,
    );
  }

  // Calculate overage
  const overage = safeString.length - options.softLimit;
  const hardLimit = options.hardLimit ?? options.softLimit + 20;
  const overageRatio = Math.min(overage / Math.max(hardLimit - options.softLimit, 1e-6), 1);

  let truncated: string;
  let method: TruncationResult["strategy"];

  // Choose truncation method based on overage ratio
  if (safeString.length >= hardLimit) {
    // Hard limit exceeded - must truncate
    truncated = hardTruncate(safeString, hardLimit, options);
    method = "hard";
  } else if (overageRatio < 0.3) {
    // Light truncation (0-30% over)
    const hardTruncatedResult = hardTruncate(safeString, hardLimit, options);
    truncated = lightTruncate(safeString, options) ?? hardTruncatedResult;
    method = truncated === hardTruncatedResult ? "hard" : "filler-word";
  } else if (overageRatio < 0.7) {
    // Medium truncation (30-70% over)
    const hardTruncatedResult = hardTruncate(safeString, hardLimit, options);
    truncated = mediumTruncate(safeString, options) ?? hardTruncatedResult;
    method = truncated === hardTruncatedResult ? "hard" : "parenthetical";
  } else {
    // Heavy truncation (70-100% over)
    const hardTruncatedResult = hardTruncate(safeString, hardLimit, options);
    truncated = heavyTruncate(safeString, options) ?? hardTruncatedResult;
    method = truncated === hardTruncatedResult ? "hard" : "keyword";
  }

  return createResult(
    normalized,
    truncated,
    true,
    method,
    safeString.length,
    overage,
    startTime,
    safeString.isUnicodeAware,
    options.softLimit,
    hardLimit,
  );
}

/**
 * Light truncation - removes filler words
 */
function lightTruncate(text: SafeString, options: TruncationOptions): string | null {
  const words = text.words();
  const important = new Set(options.importantKeywords?.map((k) => k.toLowerCase()) || []);

  const filtered = words.filter((word) => {
    const clean = word.toLowerCase().replace(/[^a-z0-9]/g, "");
    return important.has(clean) || !FILLER_WORDS.has(clean);
  });

  const result = filtered.join(" ");
  const resultLength = new SafeString(result).length;

  return resultLength <= options.softLimit ? result : null;
}

/**
 * Medium truncation - removes parentheticals and less important content
 */
function mediumTruncate(text: SafeString, options: TruncationOptions): string | null {
  let result = text.toString();

  // Handle separator-based content (e.g., "Title | Site Name")
  if (options.preserveSeparator && result.includes(options.preserveSeparator)) {
    const parts = result.split(options.preserveSeparator);
    if (parts.length === 2) {
      const [main, suffix] = parts;
      if (main && suffix) {
        const suffixWithSep = `${options.preserveSeparator}${suffix}`;
        const ellipsis = options.ellipsis || "...";
        const availableForMain = options.softLimit - suffixWithSep.length - ellipsis.length;

        if (availableForMain > 10) {
          const truncatedMain = new SafeString(main.trim()).slice(0, availableForMain);
          return `${truncatedMain}${ellipsis}${suffixWithSep}`;
        }
      }
    }
  }

  // Remove parenthetical content
  result = result.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  if (new SafeString(result).length <= options.softLimit) return result;

  // Remove quoted content
  result = result.replace(/\s*["'][^"']*["']\s*/g, " ").trim();
  if (new SafeString(result).length <= options.softLimit) return result;

  return null;
}

/**
 * Heavy truncation - preserves only essential content
 */
function heavyTruncate(text: SafeString, options: TruncationOptions): string | null {
  const ellipsis = options.ellipsis || "...";

  // For titles with separators, keep main content only
  if (options.preserveSeparator && text.toString().includes(options.preserveSeparator)) {
    const parts = text.toString().split(options.preserveSeparator);
    const mainPart = parts[0]?.trim();

    if (mainPart && new SafeString(mainPart).length <= options.softLimit - ellipsis.length) {
      return `${mainPart}${ellipsis}`;
    }
  }

  // Try to preserve important keywords
  if (options.importantKeywords && options.importantKeywords.length > 0) {
    const keywords = options.importantKeywords.slice(0, 3).join(" ");
    if (new SafeString(keywords).length <= options.softLimit - ellipsis.length) {
      return `${keywords}${ellipsis}`;
    }
  }

  return null;
}

/**
 * Hard truncation - cuts at word boundary when possible
 */
function hardTruncate(text: SafeString, limit: number, options: TruncationOptions): string {
  const ellipsis = options.ellipsis || "...";
  const maxLength = limit - ellipsis.length;

  // Try to break at word boundary
  let cutPoint = text.findWordBoundary(maxLength, "before");
  if (cutPoint < maxLength * 0.8) {
    cutPoint = maxLength; // Too much loss, just cut
  }

  return text.slice(0, cutPoint).trim() + ellipsis;
}

/**
 * Create a truncation result object
 */
function createResult(
  original: string,
  text: string,
  wasTruncated: boolean,
  strategy: TruncationResult["strategy"],
  originalLength: number,
  overage: number,
  startTime: number,
  unicodeAware = true,
  softLimit?: number,
  hardLimit?: number,
): TruncationResult {
  const metrics: TruncationMetrics = {
    originalLength,
    finalLength: new SafeString(text).length,
    overage,
    overageRatio:
      overage > 0 && softLimit && hardLimit && hardLimit !== softLimit
        ? overage / Math.max(hardLimit - softLimit, 1e-6)
        : 0,
    processingTime: performance.now() - startTime,
    unicodeAware,
  };

  return {
    text,
    original,
    wasTruncated,
    strategy,
    metrics,
  };
}
