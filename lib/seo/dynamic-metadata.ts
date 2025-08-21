/**
 * Dynamic Metadata Helpers
 * @module lib/seo/dynamic-metadata
 * @description
 * Provides consistent metadata generation for dynamic content pages.
 * Reduces duplication across blog posts, tags, bookmarks, and paginated routes.
 */

import { SEO_TITLE_SUFFIXES, SEO_TITLE_REDUNDANT_PREFIXES } from "@/lib/constants";
import { gradientTruncate } from "./text-truncation";
import type { TruncationOptions } from "@/types/seo";
import { formatTagDisplay as utilFormatTagDisplay } from "@/lib/utils/tag-utils";
import { envLogger } from "@/lib/utils/env-logger";

/**
 * Generates consistent title formatting for dynamic pages
 * @param content - The main content for the title (e.g., post title, tag name)
 * @param type - The content type ('blog', 'bookmarks', or 'default')
 * @param options - Additional options for title formatting
 * @returns Formatted title string with appropriate suffix
 */
export function generateDynamicTitle(
  content: string,
  type: "blog" | "bookmarks" | "default",
  options?: { isTag?: boolean; isPaginated?: boolean; pageNumber?: number },
): string {
  const suffix =
    type === "blog"
      ? SEO_TITLE_SUFFIXES.BLOG
      : type === "bookmarks"
        ? SEO_TITLE_SUFFIXES.BOOKMARKS
        : SEO_TITLE_SUFFIXES.DEFAULT;

  // Remove redundant prefixes to save space
  let cleanedContent = content;
  for (const prefix of SEO_TITLE_REDUNDANT_PREFIXES) {
    if (cleanedContent.startsWith(prefix)) {
      cleanedContent = cleanedContent.slice(prefix.length).trim();
      break; // Only remove the first matching prefix
    }
  }

  // Add pagination info if present
  if (options?.isPaginated && options.pageNumber) {
    cleanedContent = `${cleanedContent} - Page ${options.pageNumber}`;
  }

  // Constants for title generation
  const separator = " | ";
  const ellipsis = "...";
  const maxTotalLength = 70; // Maximum total length including suffix
  const maxContentLength = 70; // Maximum content length without suffix

  // Calculate suffix length including separator
  const suffixWithSeparator = `${separator}${suffix}`;

  // Check if we can fit both content and suffix within 70 chars
  const combinedLength = cleanedContent.length + suffixWithSeparator.length;

  if (combinedLength <= maxTotalLength) {
    // Everything fits! Return with suffix
    return `${cleanedContent}${suffixWithSeparator}`;
  }

  // Content + suffix would exceed 70 chars
  // Check if content alone fits within 70 chars
  if (cleanedContent.length <= maxContentLength) {
    // Content fits within 70 chars, but adding suffix would exceed
    // Return content without suffix
    return cleanedContent;
  }

  // Content alone exceeds 70 chars, need to truncate
  const importantKeywords: string[] | undefined = (() => {
    if (options?.isTag) {
      const tagName = cleanedContent.split(" - ")[0];
      return tagName ? [tagName] : undefined;
    }
    return undefined;
  })();

  const truncationOptions: TruncationOptions = {
    softLimit: maxContentLength - ellipsis.length, // 67 chars to leave room for ellipsis
    hardLimit: maxContentLength, // 70 chars absolute max
    ellipsis: ellipsis,
    contentType: "title",
    importantKeywords,
  };

  const result = gradientTruncate(cleanedContent, truncationOptions);

  // Log truncation for monitoring
  if (result.wasTruncated) {
    envLogger.debug(
      `Title truncated`,
      {
        original: content,
        cleaned: cleanedContent,
        truncated: result.text,
        truncatedLength: result.text.length,
        wouldBeWithSuffix: `${result.text}${suffixWithSeparator}`,
        wouldBeLength: result.text.length + suffixWithSeparator.length,
        strategy: result.strategy,
      },
      { category: "SEO" },
    );
  }

  // Return truncated content without suffix (since it would exceed 70 chars)
  return result.text;
}

/**
 * Generates engaging, consistent descriptions for tag pages
 * @param tagName - The tag name to include in the description
 * @param type - The content type ('blog' or 'bookmarks')
 * @param customTemplate - Optional custom template with {tag} placeholder
 * @returns SEO-friendly description string
 */
export function generateTagDescription(tagName: string, type: "blog" | "bookmarks", customTemplate?: string): string {
  // Build the description
  let description: string;

  // If a custom template is provided, use it
  if (customTemplate) {
    description = customTemplate.replace("{tag}", tagName.toLowerCase());
  } else {
    // Default templates that match the original variety
    if (type === "blog") {
      description = `Explore articles and insights about ${tagName.toLowerCase()} from William Callahan.`;
    } else {
      // For bookmarks, use the original more descriptive template
      description = `A collection of articles, websites, and resources I've saved about ${tagName.toLowerCase()} for future reference.`;
    }
  }

  // Apply gradient truncation with 160 char soft limit
  const truncationOptions: TruncationOptions = {
    softLimit: 160,
    hardLimit: 180,
    ellipsis: "...",
    contentType: "description",
    importantKeywords: [tagName.toLowerCase()],
  };

  const result = gradientTruncate(description, truncationOptions);

  // Log truncation in development for monitoring
  if (process.env.NODE_ENV === "development" && result.wasTruncated) {
    envLogger.debug(
      `Description truncated using ${result.strategy} strategy`,
      {
        original: result.original,
        final: result.text,
        overage: result.metrics.overage,
      },
      { category: "SEO" },
    );
  }

  return result.text;
}

/**
 * Generates dynamic descriptions with variable content
 * @param template - Template string with placeholders
 * @param variables - Object with variable replacements
 * @param truncate - Whether to apply gradient truncation (default: true)
 * @returns Formatted description string
 */
export function generateDynamicDescription(
  template: string,
  variables: Record<string, string>,
  truncate = true,
): string {
  let result = template;

  // Replace all variables in the template
  Object.entries(variables).forEach(([key, value]) => {
    const placeholder = new RegExp(`{${key}}`, "g");
    result = result.replace(placeholder, value);
  });

  // Apply gradient truncation if enabled
  if (truncate) {
    const truncationOptions: TruncationOptions = {
      softLimit: 160,
      hardLimit: 180,
      ellipsis: "...",
      contentType: "description",
      // Extract important keywords from variables
      importantKeywords: Object.values(variables).filter(v => v.length > 3),
    };

    const truncationResult = gradientTruncate(result, truncationOptions);

    // Log truncation in development for monitoring
    if (process.env.NODE_ENV === "development" && truncationResult.wasTruncated) {
      envLogger.debug(
        `Dynamic description truncated using ${truncationResult.strategy} strategy`,
        {
          original: truncationResult.original,
          final: truncationResult.text,
          overage: truncationResult.metrics.overage,
        },
        { category: "SEO" },
      );
    }

    return truncationResult.text;
  }

  return result;
}

// Re-export shared tag formatter from utils to avoid logic duplication
export const formatTagDisplay = utilFormatTagDisplay;
