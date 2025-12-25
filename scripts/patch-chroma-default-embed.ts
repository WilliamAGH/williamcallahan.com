#!/usr/bin/env bun
/**
 * Patch @chroma-core/default-embed for Turbopack compatibility
 * @module scripts/patch-chroma-default-embed
 *
 * Fixes a packaging bug where the `.d.cts` type declaration file
 * uses ESM syntax (import/export) but the `.cts` extension tells
 * Turbopack to treat it as CommonJS, causing a module format mismatch.
 *
 * Solution: Delete the broken `.d.cts` file so Turbopack uses the ESM `.d.ts`.
 * The package.json exports still work because Node/Turbopack will fall back
 * to the ESM types when the CJS types are missing.
 *
 * @see https://github.com/chroma-core/chroma/issues - upstream bug
 */

import { unlink, access } from "node:fs/promises";
import { join } from "node:path";

const PACKAGE_PATH = "node_modules/@chroma-core/default-embed";
const CJS_TYPES = "dist/cjs/default-embed.d.cts";

async function patchChromaDefaultEmbed(): Promise<void> {
  const packageDir = join(process.cwd(), PACKAGE_PATH);
  const cjsTypesPath = join(packageDir, CJS_TYPES);

  // Check if package exists
  try {
    await access(packageDir);
  } catch {
    // Package not installed, skip silently
    return;
  }

  // Check if problematic CJS types file exists
  try {
    await access(cjsTypesPath);
  } catch {
    // Already deleted or doesn't exist, skip
    return;
  }

  // Delete the problematic .d.cts file
  try {
    await unlink(cjsTypesPath);
    console.log("[patch-chroma] Deleted problematic @chroma-core/default-embed .d.cts file");
  } catch (error) {
    console.error("[patch-chroma] Failed to delete:", error);
  }
}

patchChromaDefaultEmbed();
