/**
 * Pre-build script to initialize the Content Security Policy (CSP) hash file.
 *
 * This script ensures that an empty `config/csp-hashes.json` file exists before
 * the Next.js build starts. This prevents a "Module not found" error in the
 * middleware, which imports this file, during the initial build when the file
 * has not yet been generated.
 */

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const LOG_PREFIX = "[Init CSP Hashes]";
const outputFile = resolve(process.cwd(), "config/csp-hashes.json");
const outputDir = resolve(outputFile, "..");

if (!existsSync(outputFile)) {
  console.log(`${LOG_PREFIX} config/csp-hashes.json not found. Creating empty file to prevent build errors.`);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  writeFileSync(outputFile, JSON.stringify({ scriptSrc: [], styleSrc: [] }, null, 2));
  console.log(`${LOG_PREFIX} Empty csp-hashes.json created at ${outputFile}`);
} else {
  console.log(`${LOG_PREFIX} config/csp-hashes.json already exists. Skipping creation.`);
}
