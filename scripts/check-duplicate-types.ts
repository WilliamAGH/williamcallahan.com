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
import { spawnSync } from "node:child_process";
import { relative } from "node:path";
import { z } from "zod/v4";

const ROOT = process.cwd();
const duplicateTypesBaseRefSchema = z.string().min(1).optional();
const duplicateTypesFallbackBaseRefs = ["origin/main", "origin/dev", "main", "dev"] as const;

/** Regex to capture type/interface/enum declaration names from a single line.
 * Excludes re-exports and inline imports by ensuring the name is not followed by a comma or closing brace.
 */
const DECLARATION_RE =
  /^\s*(?:export\s+(?:default\s+)?)?(?:declare\s+)?(?:type|interface|enum)\s+(\w+)(?!\s*[,}])/;

async function collectDeclarations(): Promise<Map<string, Array<{ file: string; line: number }>>> {
  const declarations = new Map<string, Array<{ file: string; line: number }>>();
  const glob = new Glob("src/types/**/*.ts");

  for await (const absolutePath of glob.scan({ cwd: ROOT, absolute: true })) {
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
  changedTypeFiles: Set<string> | null,
): number {
  let duplicateCount = 0;

  // Sort by name for deterministic output
  const sortedNames = [...declarations.keys()].toSorted();

  for (const name of sortedNames) {
    const locations = declarations.get(name);
    if (!locations || locations.length <= 1) continue;
    if (changedTypeFiles && !locations.some((location) => changedTypeFiles.has(location.file))) {
      continue;
    }

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

function gitRefExists(ref: string): boolean {
  const result = spawnSync("git", ["rev-parse", "--verify", "--quiet", ref], {
    cwd: ROOT,
    stdio: "ignore",
  });
  return result.status === 0;
}

function resolveFallbackBaseRef(): string | null {
  for (const candidate of duplicateTypesFallbackBaseRefs) {
    if (gitRefExists(candidate)) return candidate;
  }
  return null;
}

function getChangedTypeFiles(): Set<string> | null {
  const parsedBaseRef = duplicateTypesBaseRefSchema.safeParse(process.env.DUPLICATE_TYPES_BASE_REF);
  let baseRef: string;
  if (parsedBaseRef.success && typeof parsedBaseRef.data === "string") {
    baseRef = parsedBaseRef.data;
  } else {
    const fallbackBaseRef = resolveFallbackBaseRef();
    if (!fallbackBaseRef) {
      console.warn("[check:duplicate-types] No fallback git ref found; checking all declarations.");
      return null;
    }
    baseRef = fallbackBaseRef;
    if (process.env.DUPLICATE_TYPES_BASE_REF === undefined) {
      console.warn(
        `[check:duplicate-types] DUPLICATE_TYPES_BASE_REF not set; defaulting to ${baseRef}.`,
      );
    } else {
      console.warn(
        `[check:duplicate-types] Invalid DUPLICATE_TYPES_BASE_REF; defaulting to ${baseRef}.`,
      );
    }
  }
  const diff = spawnSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMR", `${baseRef}...HEAD`, "--", "src/types"],
    { cwd: ROOT, encoding: "utf-8" },
  );

  if (diff.status !== 0) {
    console.warn(
      `[check:duplicate-types] Could not diff against ${baseRef}; checking all declarations.`,
    );
    return null;
  }

  const changedFiles = diff.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".ts"));

  return new Set(changedFiles);
}

async function main(): Promise<void> {
  const changedTypeFiles = getChangedTypeFiles();
  const declarations = await collectDeclarations();
  const duplicateCount = reportDuplicates(declarations, changedTypeFiles);

  if (duplicateCount > 0) {
    console.error(
      `\n[check:duplicate-types] ${duplicateCount} duplicate type name(s) found. All type names must be globally unique.\n`,
    );
    process.exit(1);
  }

  console.log("[check:duplicate-types] No duplicate type names found.");
}

main().catch((error: unknown) => {
  const normalizedError =
    error instanceof Error
      ? { message: error.message, stack: error.stack }
      : { error: String(error) };
  console.error("[check:duplicate-types] Fatal error:", normalizedError);
  process.exit(1);
});
