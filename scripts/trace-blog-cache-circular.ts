#!/usr/bin/env bun
/**
 * Trace the exact circular dependency between blog and cache
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";

const visited = new Set<string>();
const importGraph = new Map<string, Set<string>>();

function extractImports(content: string, fromFile: string): string[] {
  const imports: string[] = [];
  const importRegex = /^import\s+(?:(?:type\s+)?{[^}]*}|[^{]*)\s+from\s+['"]([^'"]+)['"];?/gm;
  
  for (const match of content.matchAll(importRegex)) {
    const importPath = match[1];
    if (importPath && (importPath.startsWith("@/") || importPath.startsWith("./") || importPath.startsWith("../"))) {
      const resolved = resolveImportPath(importPath, fromFile);
      if (resolved) {
        imports.push(resolved);
      }
    }
  }
  
  return imports;
}

function resolveImportPath(importPath: string, fromFile: string): string | null {
  let resolvedPath: string;
  
  if (importPath.startsWith("@/")) {
    resolvedPath = importPath.slice(2);
  } else if (importPath.startsWith("./") || importPath.startsWith("../")) {
    const fromDir = dirname(fromFile);
    resolvedPath = relative("", resolve(fromDir, importPath));
  } else {
    return null;
  }
  
  // Try common extensions
  const extensions = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
  const projectRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");
  
  for (const ext of extensions) {
    const candidate = resolvedPath + ext;
    if (existsSync(resolve(projectRoot, candidate))) {
      return candidate;
    }
  }
  
  return null;
}

function analyzeFile(filePath: string, depth = 0, path: string[] = []): void {
  if (visited.has(filePath)) {
    return;
  }
  
  visited.add(filePath);
  path.push(filePath);
  
  const projectRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");
  const fullPath = resolve(projectRoot, filePath);
  
  if (!existsSync(fullPath)) {
    path.pop();
    return;
  }
  
  try {
    const content = readFileSync(fullPath, "utf-8");
    const imports = extractImports(content, filePath);
    
    importGraph.set(filePath, new Set(imports));
    
    // Check if we're importing lib/cache from types/features/blog
    if (filePath.includes("types/features/blog") && imports.some(imp => imp.includes("lib/cache"))) {
      console.log("🔴 DIRECT IMPORT FOUND:");
      console.log(`   ${filePath} → lib/cache`);
    }
    
    // Check for cycles involving blog and cache
    for (const importedFile of imports) {
      if (path.includes(importedFile)) {
        // Found a cycle
        const cycleStart = path.indexOf(importedFile);
        const cycle = path.slice(cycleStart);
        cycle.push(importedFile);
        
        // Check if this cycle involves both blog and cache
        const hasBlog = cycle.some(f => f.includes("blog"));
        const hasCache = cycle.some(f => f.includes("cache"));
        
        if (hasBlog && hasCache) {
          console.log("\n🔴 BLOG-CACHE CIRCULAR DEPENDENCY FOUND:");
          
          // Show short names like the analyzer does
          const shortNames = cycle.map((file) => {
            const parts = file.split("/");
            const lastPart = parts[parts.length - 1];
            return lastPart ? lastPart.replace(/\.(ts|tsx)$/, "") : "";
          });
          console.log("   Short: " + shortNames.join(" → "));
          
          console.log("\n   Full chain:");
          console.log("   " + cycle.join(" → "));
          console.log("\n   Detailed path:");
          cycle.forEach((file, i) => {
            console.log(`   ${i + 1}. ${file}`);
          });
          
          // Check if it matches the reported issue
          if (shortNames.join(" → ").includes("blog → cache")) {
            console.log("\n   ⚠️  This matches the reported 'blog → cache' issue!");
          }
        }
      } else {
        analyzeFile(importedFile, depth + 1, [...path]);
      }
    }
  } catch (error) {
    void error; // Intentionally unused - parse errors are expected and ignored
  }
  
  path.pop();
}

console.log("🔍 Tracing blog-cache circular dependencies...\n");

// Start from types/features/blog.ts
analyzeFile("types/features/blog.ts");

// Also check types/blog.ts (might be the actual "blog" in the error)
analyzeFile("types/blog.ts");

// Also check from lib/cache
analyzeFile("lib/cache.ts");
analyzeFile("lib/cache/index.ts");

// Check common entry points
analyzeFile("lib/blog/mdx.ts");

// Check more entry points that might be involved
analyzeFile("types/lib.ts");
analyzeFile("types/cache.ts");
analyzeFile("types/bookmark.ts");
analyzeFile("lib/bookmarks/bookmarks.ts");
analyzeFile("lib/server-cache.ts");

console.log("\n📊 Import Graph Summary:");
console.log(`   Total files analyzed: ${importGraph.size}`);

// Find all paths from blog types to cache
console.log("\n🔍 Searching for paths from types/features/blog to lib/cache...");
const blogTypeFile = "types/features/blog.ts";
const paths: string[][] = [];

function findPaths(from: string, to: string, currentPath: string[] = [], visited = new Set<string>()): void {
  if (visited.has(from)) return;
  visited.add(from);
  currentPath.push(from);
  
  if (from.includes(to) || from === to) {
    paths.push([...currentPath]);
  } else {
    const imports = importGraph.get(from) || new Set();
    for (const imp of imports) {
      findPaths(imp, to, currentPath, new Set(visited));
    }
  }
  
  currentPath.pop();
}

findPaths(blogTypeFile, "lib/cache");

if (paths.length > 0) {
  console.log(`\n🔗 Found ${paths.length} path(s) from types/features/blog to lib/cache:`);
  paths.forEach((path, i) => {
    console.log(`\n   Path ${i + 1}:`);
    path.forEach((file, j) => {
      console.log(`   ${j + 1}. ${file}`);
    });
  });
} else {
  console.log("\n✅ No direct paths found from types/features/blog to lib/cache");
}

// Also check reverse direction
console.log("\n🔍 Searching for paths from lib/cache to types/features/blog...");
const reversePaths: string[][] = [];

function findReversePaths(from: string, to: string, currentPath: string[] = [], visited = new Set<string>()): void {
  if (visited.has(from)) return;
  visited.add(from);
  currentPath.push(from);
  
  if (from.includes(to) || from === to) {
    reversePaths.push([...currentPath]);
  } else {
    const imports = importGraph.get(from) || new Set();
    for (const imp of imports) {
      findReversePaths(imp, to, currentPath, new Set(visited));
    }
  }
  
  currentPath.pop();
}

findReversePaths("lib/cache.ts", "types/features/blog");
findReversePaths("lib/cache/index.ts", "types/features/blog");

if (reversePaths.length > 0) {
  console.log(`\n🔗 Found ${reversePaths.length} reverse path(s) from lib/cache to types/features/blog:`);
  reversePaths.forEach((path, i) => {
    console.log(`\n   Path ${i + 1}:`);
    path.forEach((file, j) => {
      console.log(`   ${j + 1}. ${file}`);
    });
  });
} else {
  console.log("\n✅ No direct paths found from lib/cache to types/features/blog");
}