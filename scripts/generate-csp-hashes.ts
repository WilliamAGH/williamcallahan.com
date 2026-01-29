/**
 * Post-build script to generate Content Security Policy (CSP) hashes.
 *
 * This script scans the Next.js build output for inline scripts and styles,
 * computes their SHA256 hashes, and saves them to generated/csp-hashes.json.
 * This allows for a strict CSP without 'unsafe-inline', enhancing application security.
 *
 * @fileoverview Generates csp-hashes.json containing SHA256 hashes of all inline content
 * @module generate-csp-hashes
 *
 * @example Output format in generated/csp-hashes.json:
 * {
 *   "scriptSrc": ["'sha256-abc123...'", "'sha256-def456...'"],
 *   "styleSrc": ["'sha256-ghi789...'", "'sha256-jkl012...'"]
 * }
 *
 * @note This script is executed automatically after `next build` via package.json scripts.
 *       The generated file is gitignored and recreated on each build.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const LOG_PREFIX = "[GenerateCspHashes]";

// Directory containing the build output
const buildDir = resolve(process.cwd(), ".next");
// Output file for the hashes
const outputFile = resolve(process.cwd(), "generated/csp-hashes.json");

/**
 * Finds all HTML files in a directory recursively.
 * @param dir - The directory to search.
 * @returns An array of paths to HTML files.
 */
function findHtmlFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    console.log(`${LOG_PREFIX} Directory not found: ${dir}. Skipping.`);
    return [];
  }

  let htmlFiles: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      htmlFiles = htmlFiles.concat(findHtmlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      htmlFiles.push(fullPath);
    }
  }

  return htmlFiles;
}

/**
 * Extracts inline script and style content from HTML.
 * @param htmlContent - The HTML content to parse.
 * @returns An object containing arrays of script and style contents.
 */
function extractInlineContent(htmlContent: string): { scripts: string[]; styles: string[] } {
  const scripts: string[] = [];
  const styles: string[] = [];

  // Regex to find inline scripts (must not have a src attribute)
  const scriptRegex = /<script(?![^>]*?\ssrc=)>(.*?)<\/script>/gs;
  // Regex to find inline styles
  const styleRegex = /<style.*?>(.*?)<\/style>/gs;

  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(htmlContent)) !== null) {
    if (match[1]?.trim()) {
      scripts.push(match[1].trim());
    }
  }
  while ((match = styleRegex.exec(htmlContent)) !== null) {
    if (match[1]?.trim()) {
      styles.push(match[1].trim());
    }
  }

  return { scripts, styles };
}

/**
 * Calculates the SHA256 hash of a string and formats it for CSP.
 * @param content - The string to hash.
 * @returns The CSP-formatted SHA256 hash.
 */
function calculateHash(content: string): string {
  const hash = createHash("sha256").update(content).digest("base64");
  return `'sha256-${hash}'`;
}

/**
 * Main function to generate CSP hashes for all inline content in the Next.js build.
 *
 * Workflow:
 * 1. Scans .next/server/app directory for all HTML files
 * 2. Extracts inline <script> and <style> content from each HTML file
 * 3. Computes SHA256 hash for each unique inline content
 * 4. Writes the hashes to generated/csp-hashes.json
 *
 * The generated file structure:
 * - scriptSrc: Array of CSP-formatted hashes for inline scripts
 * - styleSrc: Array of CSP-formatted hashes for inline styles
 *
 * @throws {Error} Exits with code 1 if hash generation fails
 */
function generateHashes() {
  console.log(`${LOG_PREFIX} Starting CSP hash generation...`);

  const serverAppDir = join(buildDir, "server", "app");
  const htmlFiles = findHtmlFiles(serverAppDir);

  if (htmlFiles.length === 0) {
    console.warn(`${LOG_PREFIX} No HTML files found in ${serverAppDir}. Cannot generate hashes.`);
    // Still write an empty file to prevent build failures if the file is expected
    const outputDir = resolve(outputFile, "..");
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
    writeFileSync(outputFile, JSON.stringify({ scriptSrc: [], styleSrc: [] }, null, 2));
    return;
  }

  console.log(`${LOG_PREFIX} Found ${htmlFiles.length} HTML files to process.`);

  const scriptHashes = new Set<string>();
  const styleHashes = new Set<string>();

  for (const file of htmlFiles) {
    const htmlContent = readFileSync(file, "utf-8");
    const { scripts, styles } = extractInlineContent(htmlContent);

    scripts.forEach((script) => scriptHashes.add(calculateHash(script)));
    styles.forEach((style) => styleHashes.add(calculateHash(style)));
  }

  // Prepare output structure matching the expected format
  const output = {
    scriptSrc: Array.from(scriptHashes),
    styleSrc: Array.from(styleHashes),
  };

  // Ensure the generated directory exists
  const outputDir = resolve(outputFile, "..");
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Write the hashes to generated/csp-hashes.json
  // This file is imported by proxy.ts to apply CSP headers
  writeFileSync(outputFile, JSON.stringify(output, null, 2));

  console.log(
    `${LOG_PREFIX} Successfully generated ${output.scriptSrc.length} script hashes and ${output.styleSrc.length} style hashes.`,
  );
  console.log(`${LOG_PREFIX} Hashes saved to ${outputFile}`);
}

try {
  generateHashes();
} catch (error) {
  console.error(`${LOG_PREFIX} An error occurred during hash generation:`, error);
  process.exit(1);
}
