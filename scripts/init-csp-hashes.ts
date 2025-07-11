/**
 * Pre-build script to initialize the Content Security Policy (CSP) hash file.
 *
 * This script ensures that an empty `config/csp-hashes.json` file exists before
 * the Next.js build starts. This prevents a "Module not found" error in the
 * middleware, which imports this file, during the initial build when the file
 * has not yet been generated.
 *
 * @fileoverview Creates an empty csp-hashes.json if it doesn't exist
 * @module init-csp-hashes
 *
 * @example Initial file content:
 * {
 *   "scriptSrc": [],
 *   "styleSrc": []
 * }
 *
 * @note This script runs before EVERY build (dev, production) to ensure the file exists.
 *       The actual hashes are populated by generate-csp-hashes.ts after production builds.
 */

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const LOG_PREFIX = "[Init CSP Hashes]";
const outputFile = resolve(process.cwd(), "config/csp-hashes.json");
const outputDir = resolve(outputFile, "..");

/**
 * ALWAYS-RESET GUARANTEE (DO NOT REMOVE)
 * --------------------------------------
 * This script **ALWAYS** overwrites `config/csp-hashes.json` with empty
 * arrays at the start of every dev *and* production build.
 *
 * Rationale:
 * • Production builds append thousands of script hashes.  If that file leaks
 *   into a dev session, the middleware will import it and the browser will
 *   silently drop `'unsafe-inline'`, blocking Next.js bootstrap scripts and
 *   halting local development.
 * • Skipping the reset was the root cause of the CSP-induced white-screen in
 *   PR #181.  We never want to relive that.
 *
 * Therefore: **Do not add an existence guard or early-return here.** If you
 * think you need to retain hashes in dev, stop and re-evaluate the CSP flow.
 */

if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

writeFileSync(outputFile, JSON.stringify({ scriptSrc: [], styleSrc: [] }, null, 2));
console.log(`${LOG_PREFIX} csp-hashes.json reset to empty arrays at ${outputFile}`);
