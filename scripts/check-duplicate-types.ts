#!/usr/bin/env bun

/**
 * Deterministic build-time check for globally unique type/interface/enum names.
 *
 * Replaces the ESLint custom rule (`project/no-duplicate-types`) which used a
 * module-level Map that caused nondeterministic warnings depending on ESLint's
 * file-processing order. This script processes ALL files first, then reports
 * ALL duplicates with consistent, sorted output.
 *
 * Exit codes:
 *   0 – no duplicates found
 *   1 – duplicates detected (prints details to stderr)
 */

import { Glob } from "bun";
import { readFile } from "node:fs/promises";
import { relative } from "node:path";

const ROOT = process.cwd();

/** Regex to capture type/interface/enum declaration names from a single line. */
const DECLARATION_RE =
  /^\s*(?:export\s+(?:default\s+)?)?(?:declare\s+)?(?:type|interface|enum)\s+(\w+)/;

async function collectDeclarations(): Promise<Map<string, Array<{ file: string; line: number }>>> {
  const declarations = new Map<string, Array<{ file: string; line: number }>>();
  const glob = new Glob("src/types/**/*.ts");

  for await (const absolutePath of glob.scan({ cwd: ROOT, absolute: true })) {
    // Skip declaration files — ambient types can legitimately re-declare
    if (absolutePath.endsWith(".d.ts")) continue;

    const relPath = relative(ROOT, absolutePath);
    const content = await readFile(absolutePath, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i]?.match(DECLARATION_RE);
      if (!match?.[1]) continue;

      const name = match[1];
      const entry = { file: relPath, line: i + 1 };

      const existing = declarations.get(name);
      if (existing) {
        existing.push(entry);
      } else {
        declarations.set(name, [entry]);
      }
    }
  }

  return declarations;
}

function reportDuplicates(
  declarations: Map<string, Array<{ file: string; line: number }>>,
): number {
  let duplicateCount = 0;

  // Sort by name for deterministic output
  const sortedNames = [...declarations.keys()].toSorted();

  for (const name of sortedNames) {
    const locations = declarations.get(name);
    if (!locations || locations.length <= 1) continue;

    // Sort locations by file path then line number for deterministic output
    locations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

    duplicateCount++;
    console.error(`\n  Type "${name}" is declared ${locations.length} times:`);
    for (const loc of locations) {
      console.error(`    ${loc.file}:${loc.line}`);
    }
  }

  return duplicateCount;
}

async function main(): Promise<void> {
  const declarations = await collectDeclarations();
  const duplicateCount = reportDuplicates(declarations);

  if (duplicateCount > 0) {
    console.error(
      `\n[check:duplicate-types] ${duplicateCount} duplicate type name(s) found. All type names must be globally unique.\n`,
    );
    process.exit(1);
  }

  console.log("[check:duplicate-types] No duplicate type names found.");
}

main().catch((error: unknown) => {
  console.error("[check:duplicate-types] Fatal error:", error);
  process.exit(1);
});
