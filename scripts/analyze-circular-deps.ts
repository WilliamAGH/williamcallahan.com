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
      const imports = this.extractImports(content, relativePath);
      const exports = this.extractExports(content);

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
    const importRegex = /^import\s+(?:(?:type\s+)?{[^}]*}|[^{]*)\s+from\s+['"]([^'"]+)['"];?/gm;

    for (const match of content.matchAll(importRegex)) {
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
          .map((e) => {
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

    // Try common extensions
    const extensions = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

    for (const ext of extensions) {
      const candidate = resolvedPath + ext;
      if (this.nodes.has(candidate) || existsSync(resolve(this.projectRoot, candidate))) {
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
    const shortNames = chain.map((file) => {
      const parts = file.split("/");
      const lastPart = parts.length > 0 ? parts[parts.length - 1] : null;
      return lastPart ? lastPart.replace(/\.(ts|tsx)$/, "") : "";
    });

    return `${shortNames.join(" → ")}`;
  }

  private assessSeverity(chain: string[]): "high" | "medium" | "low" {
    const hasTypesLib = chain.some(
      (file) =>
        (file.includes("types/") && chain.some((f) => f.includes("lib/"))) ||
        (file.includes("lib/") && chain.some((f) => f.includes("types/"))),
    );

    const hasComponents = chain.some((file) => file.includes("components/"));

    if (hasTypesLib) return "high";
    if (hasComponents) return "medium";
    return "low";
  }

  private estimateImpact(chain: string[]): number {
    // Estimate based on common patterns that cause many TypeScript warnings
    let impact = 10; // Base impact

    // Types ↔ Lib cycles cause the most warnings
    if (chain.some((f) => f.includes("types/")) && chain.some((f) => f.includes("lib/"))) {
      impact += 50;
    }

    // Validator cycles cause type inference issues
    if (chain.some((f) => f.includes("validators"))) {
      impact += 30;
    }

    // Component cycles cause prop typing issues
    if (chain.some((f) => f.includes("components/"))) {
      impact += 20;
    }

    // Longer chains tend to cause more issues
    impact += chain.length * 5;

    return impact;
  }

  printAnalysis(cycles: CircularChain[]): void {
    if (cycles.length === 0) {
      console.log("✅ No circular dependencies found!");
      return;
    }

    console.log("\n🔴 CIRCULAR DEPENDENCIES DETECTED:\n");

    cycles.forEach((cycle, index) => {
      const severityIcon = {
        high: "🔴",
        medium: "🟡",
        low: "🟢",
      }[cycle.severity];

      console.log(`${index + 1}. ${severityIcon} ${cycle.severity.toUpperCase()} (Impact: ${cycle.impactEstimate})`);
      console.log(`   ${cycle.description}`);
      console.log(`   Chain: ${cycle.chain.join(" → ")}`);
      console.log(`   Fix: ${this.suggestFix(cycle.chain)}\n`);
    });

    console.log("💡 RECOMMENDED ACTIONS:");
    console.log("1. Fix high severity cycles first (types ↔ lib dependencies)");
    console.log("2. Move shared constants to types/ layer or create separate constants file");
    console.log("3. Use type-only imports where possible: import type { ... }");
    console.log("4. Consider extracting shared types to a common file");
  }

  private suggestFix(chain: string[]): string {
    const hasTypes = chain.some((f) => f.includes("types/"));
    const hasLib = chain.some((f) => f.includes("lib/"));
    const hasValidators = chain.some((f) => f.includes("validators"));
    const hasConstants = chain.some((f) => f.includes("constants"));

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

  try {
    const cycles = await analyzer.analyze();
    analyzer.printAnalysis(cycles);
  } catch (error) {
    console.error("❌ An error occurred during analysis:", error);
    process.exit(1);
  }
}

void main();
