#!/usr/bin/env bun
/**
 * Circular Dependency Analysis Tool
 *
 * Analyzes TypeScript imports to detect circular dependencies that cause
 * "error typed value" warnings in TypeScript compilation.
 */

import { existsSync, readFileSync } from "node:fs";
import { glob } from "glob";
import { resolve, relative, dirname } from "node:path";
import type { CircularChain, ImportNode } from "@/types/utils/circular-deps";

class CircularDependencyAnalyzer {
  private nodes = new Map<string, ImportNode>();
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async analyze(): Promise<CircularChain[]> {
    console.log("🔍 Scanning TypeScript files...");

    // Find all TypeScript files
    const files = await glob("**/*.{ts,tsx}", {
      cwd: this.projectRoot,
      ignore: [
        "node_modules/**",
        ".next/**",
        "dist/**",
        "build/**",
        "coverage/**",
        "**/*.d.ts",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.spec.ts",
        "**/*.spec.tsx",
      ],
    });

    console.log(`📂 Found ${files.length} TypeScript files`);

    // Parse imports for each file
    for (const file of files) {
      this.parseFile(file);
    }

    console.log("🔗 Detecting circular dependencies...");

    // Detect circular dependencies
    const cycles = this.detectCycles();

    console.log(`⚠️  Found ${cycles.length} circular dependencies`);

    return cycles;
  }

  private parseFile(relativePath: string): void {
    const fullPath = resolve(this.projectRoot, relativePath);

    if (!existsSync(fullPath)) {
      return;
    }

    try {
      const content = readFileSync(fullPath, "utf-8");

      // Strip comments to avoid false positives from import-like statements in comments
      const cleanContent = content
        .replace(/\/\*[\s\S]*?\*\//g, "") // Remove block comments
        .replace(/\/\/.*/g, ""); // Remove line comments

      const imports = this.extractImports(cleanContent, relativePath);
      const exports = this.extractExports(cleanContent);

      this.nodes.set(relativePath, {
        file: relativePath,
        imports,
        exports,
      });
    } catch (error) {
      console.warn(`⚠️  Failed to parse ${relativePath}:`, error);
    }
  }

  private extractImports(content: string, fromFile: string): string[] {
    const imports: string[] = [];

    // More precise regex that handles all import types
    // Matches: import { ... } from '...', import type { ... } from '...', import * as ... from '...', etc.
    const allImportRegex =
      /^\s*import\s+(?:type\s+)?(?:{[^}]*}|\*\s+as\s+\w+|\w+|['"][^'"]+['"])\s+from\s+['"]([^'"]+)['"];?/gm;

    for (const match of content.matchAll(allImportRegex)) {
      const importPath = match[1];

      if (importPath && (importPath.startsWith("@/") || importPath.startsWith("./") || importPath.startsWith("../"))) {
        const resolvedPath = this.resolveImportPath(importPath, fromFile);
        if (resolvedPath) {
          imports.push(resolvedPath);
        }
      }
    }

    return imports;
  }

  private extractExports(content: string): string[] {
    const exports: string[] = [];
    const exportRegex =
      /^export\s+(?:(?:type\s+)?(?:interface\s+|class\s+|const\s+|let\s+|var\s+|function\s+|enum\s+)?(\w+)|{([^}]*)})/gm;

    for (const match of content.matchAll(exportRegex)) {
      if (match[1]) {
        exports.push(match[1]);
      } else if (match[2]) {
        const namedExports = match[2]
          .split(",")
          .map(e => {
            const trimmed = e.trim();
            const beforeAs = trimmed.split(" as ")[0];
            return beforeAs || "";
          })
          .filter(Boolean);
        exports.push(...namedExports);
      }
    }

    return exports;
  }

  private resolveImportPath(importPath: string, fromFile: string): string | null {
    let resolvedPath: string;

    if (importPath.startsWith("@/")) {
      // Handle absolute imports with @/ alias
      resolvedPath = importPath.slice(2); // Remove @/
    } else if (importPath.startsWith("./") || importPath.startsWith("../")) {
      // Handle relative imports
      const fromDir = dirname(fromFile);
      resolvedPath = relative("", resolve(fromDir, importPath));
    } else {
      return null;
    }

    // Strategy 1: Check if path already has an extension
    if (resolvedPath.endsWith(".ts") || resolvedPath.endsWith(".tsx")) {
      const fullPath = resolve(this.projectRoot, resolvedPath);
      if (existsSync(fullPath)) {
        return resolvedPath;
      }
    }

    // Strategy 2: Try adding extensions to the path
    const fileExtensions = [".ts", ".tsx"];
    for (const ext of fileExtensions) {
      const candidate = resolvedPath + ext;
      const fullPath = resolve(this.projectRoot, candidate);
      if (existsSync(fullPath)) {
        return candidate;
      }
    }

    // Strategy 3: Check if it's a directory with index file
    const indexExtensions = ["/index.ts", "/index.tsx"];
    for (const ext of indexExtensions) {
      const candidate = resolvedPath + ext;
      const fullPath = resolve(this.projectRoot, candidate);
      if (existsSync(fullPath)) {
        return candidate;
      }
    }

    return null;
  }

  private detectCycles(): CircularChain[] {
    const cycles: CircularChain[] = [];
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const stack: string[] = [];

    for (const [file] of this.nodes) {
      if (!visited.has(file)) {
        this.dfs(file, visited, inStack, stack, cycles);
      }
    }

    return cycles.sort((a, b) => b.impactEstimate - a.impactEstimate);
  }

  private dfs(
    file: string,
    visited: Set<string>,
    inStack: Set<string>,
    stack: string[],
    cycles: CircularChain[],
  ): void {
    visited.add(file);
    inStack.add(file);
    stack.push(file);

    const node = this.nodes.get(file);
    if (!node) return;

    for (const importedFile of node.imports) {
      if (!visited.has(importedFile)) {
        this.dfs(importedFile, visited, inStack, stack, cycles);
      } else if (inStack.has(importedFile)) {
        // Found a cycle
        const cycleStart = stack.indexOf(importedFile);
        const chain = [...stack.slice(cycleStart), importedFile];

        cycles.push({
          chain,
          description: this.describeCycle(chain),
          severity: this.assessSeverity(chain),
          impactEstimate: this.estimateImpact(chain),
        });
      }
    }

    stack.pop();
    inStack.delete(file);
  }

  private describeCycle(chain: string[]): string {
    const shortNames = chain.map(file => {
      const parts = file.split("/");
      const lastPart = parts.length > 0 ? parts[parts.length - 1] : null;
      return lastPart ? lastPart.replace(/\.(ts|tsx)$/, "") : "";
    });

    return `${shortNames.join(" → ")}`;
  }

  private assessSeverity(chain: string[]): "high" | "medium" | "low" {
    // Check for actual bidirectional cycles between types and lib
    const hasTypesLib = chain.some((file, idx) => {
      if (file.includes("types/")) {
        // Check if any lib file later in the chain imports back to types
        return (
          chain.slice(idx + 1).some(f => f.includes("lib/")) && chain.slice(idx + 1).some(f => f.includes("types/"))
        );
      }
      return false;
    });

    const hasComponents = chain.some(file => file.includes("components/"));

    if (hasTypesLib) return "high";
    if (hasComponents) return "medium";
    return "low";
  }

  private estimateImpact(chain: string[]): number {
    // Estimate based on common patterns that cause many TypeScript warnings
    let impact = 10; // Base impact

    // Types ↔ Lib cycles cause the most warnings
    if (chain.some(f => f.includes("types/")) && chain.some(f => f.includes("lib/"))) {
      impact += 50;
    }

    // Validator cycles cause type inference issues
    if (chain.some(f => f.includes("validators"))) {
      impact += 30;
    }

    // Component cycles cause prop typing issues
    if (chain.some(f => f.includes("components/"))) {
      impact += 20;
    }

    // Longer chains tend to cause more issues
    impact += chain.length * 5;

    return impact;
  }

  printAnalysis(cycles: CircularChain[], showFull = false): void {
    if (cycles.length === 0) {
      console.log("✅ No circular dependencies found!");
      return;
    }

    // Filter cycles based on --full flag
    const filteredCycles = showFull
      ? cycles
      : cycles.filter(cycle => {
          // Exclude cycles that only go through scripts, app files, or UI components
          // These don't impact type safety or runtime behavior
          const isOnlyUIOrScripts = cycle.chain.every(
            f =>
              f.includes("scripts/") ||
              f.includes("app/") ||
              f.includes("components/") ||
              f.includes("hooks/") ||
              f.includes("data/blog/posts"), // Empty file
          );

          if (isOnlyUIOrScripts) return false;

          // Include cycles that have actual runtime impact
          const hasLibDependency = cycle.chain.some(f => f.includes("lib/"));
          const hasTypesDependency = cycle.chain.some(f => f.includes("types/"));
          const hasHighImpact = cycle.impactEstimate >= 70;

          return hasLibDependency || hasTypesDependency || hasHighImpact;
        });

    if (filteredCycles.length === 0 && !showFull) {
      console.log("✅ No critical circular dependencies found!");
      if (cycles.length > 0) {
        console.log(`ℹ️  ${cycles.length} non-critical cycles hidden. Use --full to see all.`);
      }
      return;
    }

    console.log("\n🔴 CIRCULAR DEPENDENCIES DETECTED:\n");

    filteredCycles.forEach((cycle, index) => {
      const severityIcon = {
        high: "🔴",
        medium: "🟡",
        low: "🟢",
      }[cycle.severity];

      console.log(`${index + 1}. ${severityIcon} ${cycle.severity.toUpperCase()} (Impact: ${cycle.impactEstimate})`);
      console.log(`   ${cycle.description}`);
      console.log(`   Chain: ${cycle.chain.join(" → ")}`);

      // Show full chain for blog → cache issues
      if (cycle.description.includes("blog → cache")) {
        console.log(`   🔍 FULL CHAIN DETAILS:`);
        cycle.chain.forEach((file, i) => {
          console.log(`      ${i + 1}. ${file}`);
        });
      }

      console.log(`   Fix: ${this.suggestFix(cycle.chain)}\n`);
    });

    if (!showFull && cycles.length > filteredCycles.length) {
      console.log(
        `\nℹ️  Showing ${filteredCycles.length} critical cycles. ${cycles.length - filteredCycles.length} non-critical cycles hidden.`,
      );
      console.log("   Use --full to see all circular dependencies.\n");
    }

    console.log("💡 RECOMMENDED ACTIONS:");
    console.log("1. Fix high severity cycles first (types ↔ lib dependencies)");
    console.log("2. Move shared constants to types/ layer or create separate constants file");
    console.log("3. Use type-only imports where possible: import type { ... }");
    console.log("4. Consider extracting shared types to a common file");
  }

  private suggestFix(chain: string[]): string {
    const hasTypes = chain.some(f => f.includes("types/"));
    const hasLib = chain.some(f => f.includes("lib/"));
    const hasValidators = chain.some(f => f.includes("validators"));
    const hasConstants = chain.some(f => f.includes("constants"));

    if (hasTypes && hasLib && hasValidators) {
      return "Move Zod schema to types/ or use interface + separate validation";
    }

    if (hasTypes && hasConstants) {
      return "Move constants to types/ layer or create shared constants file";
    }

    if (hasTypes && hasLib) {
      return "Break cycle by moving shared constants or using type-only imports";
    }

    return "Extract shared dependencies to a common module";
  }
}

// Main execution
async function main() {
  const projectRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");
  const analyzer = new CircularDependencyAnalyzer(projectRoot);

  // Check for --full flag
  const showFull = process.argv.includes("--full");

  try {
    const cycles = await analyzer.analyze();
    analyzer.printAnalysis(cycles, showFull);

    // Only exit with non-zero status if there are critical cycles
    // (non-critical cycles don't impact type safety or runtime behavior)
    const criticalCycles = cycles.filter(cycle => {
      const hasTypesLibCycle = cycle.chain.some(f => f.includes("types/")) && cycle.chain.some(f => f.includes("lib/"));
      const isHighSeverity = cycle.severity === "high";
      const hasHighImpact = cycle.impactEstimate >= 70;

      const isOnlyUIOrScripts = cycle.chain.every(
        f => f.includes("scripts/") || f.includes("app/") || f.includes("components/") || f.includes("data/blog/posts"),
      );

      return (hasTypesLibCycle || isHighSeverity || hasHighImpact) && !isOnlyUIOrScripts;
    });

    if (criticalCycles.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ An error occurred during analysis:", error);
    process.exit(1);
  }
}

void main();
