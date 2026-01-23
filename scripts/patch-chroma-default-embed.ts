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

import { unlink } from "node:fs/promises";
import { join } from "node:path";

const LOG_PREFIX = "[patch-chroma]";
const PACKAGE_PATH = "node_modules/@chroma-core/default-embed";
const CJS_TYPES_RELATIVE = "dist/cjs/default-embed.d.cts";

/**
 * Type guard for Node.js filesystem errors with error codes
 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function patchChromaDefaultEmbed(): Promise<void> {
  const cjsTypesPath = join(process.cwd(), PACKAGE_PATH, CJS_TYPES_RELATIVE);

  try {
    await unlink(cjsTypesPath);
    console.log(`${LOG_PREFIX} Deleted problematic .d.cts file`);
  } catch (error: unknown) {
    // ENOENT: file doesn't exist - expected if package isn't installed or already patched
    if (isNodeError(error) && error.code === "ENOENT") {
      console.log(`${LOG_PREFIX} File not present, no patch needed`);
      return;
    }
    // Unexpected error - propagate for visibility in build logs
    throw error;
  }
}

await patchChromaDefaultEmbed();
