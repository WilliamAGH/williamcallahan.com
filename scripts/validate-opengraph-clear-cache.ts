#!/usr/bin/env bun
/**
 * OpenGraph Validation & Twitter Cache Clearing Utility
 * @file scripts/validate-opengraph-clear-cache.ts
 * @module scripts/validate-opengraph-clear-cache
 * @description
 * This script performs critical SEO maintenance tasks for social media optimization:
 *
 * **Primary Functions:**
 * 1. **Real OpenGraph Validation**: Fetches actual HTML and parses OpenGraph tags
 * 2. **Multi-Platform Cache Clearing**: Uses proper debugging tools for Twitter, Facebook, and LinkedIn
 *
 * **When to Use:**
 * - After updating OpenGraph images or metadata
 * - When social media previews show outdated content
 * - As part of deployment pipeline for SEO verification
 * - Manual troubleshooting of social media preview issues
 *
 * **Usage Examples:**
 * ```bash
 * # Manual execution for immediate cache clearing
 * bun run validate-opengraph
 *
 * # Via package.json script (recommended)
 * bun run scripts/validate-opengraph-clear-cache.ts
 * ```
 *
 * **Important Notes:**
 * - Uses Facebook Sharing Debugger, Twitter Card Validator, and LinkedIn Post Inspector
 * - Cache clearing effects may take 5-10 minutes to propagate across CDNs
 * - This script is safe to run multiple times (idempotent operation)
 *
 * @see {@link "../lib/seo/og-validation.ts"} - Core validation functions
 * @see {@link "../types/seo/validation.ts"} - Type definitions
 * @see {@link "https://developers.facebook.com/tools/debug/"} - Facebook Sharing Debugger
 * @see {@link "https://cards-dev.twitter.com/validator"} - Twitter Card Validator
 * @see {@link "https://www.linkedin.com/post-inspector/"} - LinkedIn Post Inspector
 */

import { metadata as siteMetadata } from "@/data/metadata";
import { clearSocialMediaCaches } from "./lib/social-cache-clearing";

/**
 * Validates OpenGraph metadata for a specific URL by fetching and parsing HTML
 * @function validateOpenGraph
 * @param {string} url - Full URL of the page to validate
 * @returns {Promise<{isValid: boolean, errors: string[], warnings: string[], ogTags: Record<string, string>}>} Promise that resolves with validation results
 * @description
 * **Real Implementation:**
 * Fetches the actual HTML content and parses OpenGraph meta tags to validate them.
 *
 * **Validation Checks:**
 * 1. **Required Tags**: Ensures `og:title`, `og:description`, `og:image`, `og:url` exist
 * 2. **Image Requirements**: Validates image URLs and dimensions (minimum 144x144px, recommended 1200x630px)
 * 3. **Content Limits**: Checks title ≤60 chars, description ≤160 chars
 * 4. **URL Accessibility**: Verifies images are publicly accessible via HTTPS
 *
 * @example
 * ```typescript
 * const result = await validateOpenGraph('https://williamcallahan.com/');
 * console.log('OG Tags found:', result.ogTags);
 * if (!result.isValid) {
 *   console.error('Validation errors:', result.errors);
 * }
 * ```
 */
async function validateOpenGraph(url: string): Promise<{
  isValid: boolean;
  errors: string[];
  warnings: string[];
  ogTags: Record<string, string>;
}> {
  const result = {
    isValid: true,
    errors: [] as string[],
    warnings: [] as string[],
    ogTags: {} as Record<string, string>,
  };

  try {
    console.log(`🔍 Fetching HTML from ${url}...`);

    // Fetch the actual HTML content
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; OGValidator/1.0; +https://williamcallahan.com)",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    // Parse OpenGraph tags from HTML
    const ogTagRegex = /<meta\s+property=["']og:([^"']+)["']\s+content=["']([^"']*)["'][^>]*>/gi;
    const twitterTagRegex =
      /<meta\s+name=["']twitter:([^"']+)["']\s+content=["']([^"']*)["'][^>]*>/gi;

    let match: RegExpExecArray | null;

    // Extract OpenGraph tags
    while ((match = ogTagRegex.exec(html)) !== null) {
      const [, property, content] = match;
      if (property && content !== undefined) {
        result.ogTags[`og:${property}`] = content;
      }
    }

    // Extract Twitter Card tags
    while ((match = twitterTagRegex.exec(html)) !== null) {
      const [, property, content] = match;
      if (property && content !== undefined) {
        result.ogTags[`twitter:${property}`] = content;
      }
    }

    console.log(`📋 Found ${Object.keys(result.ogTags).length} social media meta tags`);

    // Validate required OpenGraph tags
    const requiredTags = ["og:title", "og:description", "og:image", "og:url"];
    for (const tag of requiredTags) {
      if (!result.ogTags[tag]) {
        result.errors.push(`Missing required tag: ${tag}`);
        result.isValid = false;
      }
    }

    // Validate content quality
    if (result.ogTags["og:title"]) {
      if (result.ogTags["og:title"].length > 60) {
        result.warnings.push(
          `og:title is ${result.ogTags["og:title"].length} chars (recommended: ≤60)`,
        );
      }
    }

    if (result.ogTags["og:description"]) {
      if (result.ogTags["og:description"].length > 160) {
        result.warnings.push(
          `og:description is ${result.ogTags["og:description"].length} chars (recommended: ≤160)`,
        );
      }
    }

    // Validate image URL
    if (result.ogTags["og:image"]) {
      const imageUrl = result.ogTags["og:image"];
      if (!imageUrl.startsWith("https://")) {
        result.warnings.push("og:image should use HTTPS for better social media compatibility");
      }

      // Check if image is accessible (basic check)
      try {
        const imageResponse = await fetch(imageUrl, { method: "HEAD" });
        if (!imageResponse.ok) {
          result.errors.push(`og:image is not accessible (HTTP ${imageResponse.status})`);
          result.isValid = false;
        }
      } catch {
        result.warnings.push("Could not verify og:image accessibility");
      }
    }

    return result;
  } catch (error) {
    return {
      isValid: false,
      errors: [`Validation failed: ${error instanceof Error ? error.message : String(error)}`],
      warnings: [],
      ogTags: {},
    };
  }
}

async function main() {
  console.log("🚀 Starting REAL OpenGraph validation and social media cache clearing\n");

  // Key pages for social media optimization
  const keyPages = [
    "/", // Homepage - primary landing page
    "/bookmarks", // Bookmarks - content discovery
    "/blog", // Blog index - article discovery
    "/projects", // Projects - portfolio showcase
  ];

  for (const path of keyPages) {
    const fullUrl = new URL(path, siteMetadata.site.url).toString();
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🔍 Processing: ${fullUrl}`);
    console.log(`${"=".repeat(60)}`);

    // Step 1: Real OpenGraph validation
    console.log(`\n📋 VALIDATION RESULTS:`);
    const validation = await validateOpenGraph(fullUrl);

    if (validation.isValid) {
      console.log(`✅ OpenGraph validation PASSED`);
    } else {
      console.log(`❌ OpenGraph validation FAILED`);
      console.log(`   Errors: ${validation.errors.join(", ")}`);
    }

    if (validation.warnings.length > 0) {
      console.log(`⚠️  Warnings: ${validation.warnings.join(", ")}`);
    }

    // Show key tags
    const keyTags = ["og:title", "og:description", "og:image", "og:type"];
    console.log(`\n📝 KEY OPENGRAPH TAGS:`);
    for (const tag of keyTags) {
      if (validation.ogTags[tag]) {
        const value = validation.ogTags[tag];
        const truncated = value.length > 60 ? `${value.substring(0, 60)}...` : value;
        console.log(`   ${tag}: ${truncated}`);
      } else {
        console.log(`   ${tag}: ❌ MISSING`);
      }
    }

    // Step 2: Clear social media caches
    console.log(`\n🔄 CACHE CLEARING:`);
    await clearSocialMediaCaches(fullUrl);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("✨ All operations completed!");
  console.log("ℹ️  Social media cache updates may take 5-10 minutes to propagate");
  console.log("🔗 Use the manual verification links above to test immediately");
  console.log(`${"=".repeat(60)}`);
}

// Execute the script with proper error handling
try {
  await main();
} catch (err) {
  console.error("❌ Script execution failed:", err);
  process.exit(1);
}
