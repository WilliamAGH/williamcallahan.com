#!/usr/bin/env bun

/**
 * Lint Progress Tracker
 *
 * This script tracks the current state of linting issues in the project,
 * helping monitor progress as issues are fixed over time.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import type { LintStats } from "@/types/lint-progress";

const PROGRESS_FILE = path.join(process.cwd(), ".lint-progress.json");

function runLintCheck(): string {
  try {
    // Run ESLint and capture output
    const output = execSync("bun run lint:es 2>&1", {
      encoding: "utf-8",
      stdio: "pipe",
    }).toString();
    return output;
  } catch (error: any) {
    // ESLint exits with non-zero when there are issues, but we still get the output
    return error.stdout?.toString() || "";
  }
}

function parseLintOutput(output: string): LintStats {
  const stats: LintStats = {
    timestamp: new Date().toISOString(),
    totalIssues: 0,
    errors: 0,
    warnings: 0,
    byRule: {},
    byFile: {},
  };

  // Parse the summary line (e.g., "✖ 20 problems (8 errors, 12 warnings)")
  const summaryMatch = output.match(/✖\s+(\d+)\s+problems?\s+\((\d+)\s+errors?,\s+(\d+)\s+warnings?\)/);
  if (summaryMatch) {
    stats.totalIssues = parseInt(summaryMatch[1] || "0", 10);
    stats.errors = parseInt(summaryMatch[2] || "0", 10);
    stats.warnings = parseInt(summaryMatch[3] || "0", 10);
  } else {
    // Check if no issues
    const noIssuesMatch = output.match(/✔\s+No\s+problems/);
    if (noIssuesMatch) {
      return stats;
    }
  }

  // Parse individual issues
  const lines = output.split("\n");
  let currentFile = "";

  for (const line of lines) {
    // Match file paths
    const fileMatch = line.match(/^(\/[^\s]+\.(ts|tsx|js|jsx|mdx))$/);
    if (fileMatch) {
      currentFile = fileMatch[1] || "";
      if (currentFile && !stats.byFile[currentFile]) {
        stats.byFile[currentFile] = 0;
      }
      continue;
    }

    // Match issue lines (e.g., "  294:13  warning  Variable name `_pageWrite` must match...")
    const issueMatch = line.match(/^\s+\d+:\d+\s+(error|warning)\s+(.+?)\s+(@?\S+)$/);
    if (issueMatch && currentFile) {
      const [, , , ruleName] = issueMatch;

      if (ruleName) {
        // Count by file
        stats.byFile[currentFile] = (stats.byFile[currentFile] || 0) + 1;

        // Count by rule
        stats.byRule[ruleName] = (stats.byRule[ruleName] || 0) + 1;
      }
    }
  }

  return stats;
}

function loadProgress(): LintStats[] {
  if (fs.existsSync(PROGRESS_FILE)) {
    const data = fs.readFileSync(PROGRESS_FILE, "utf-8");
    return JSON.parse(data);
  }
  return [];
}

function saveProgress(history: LintStats[]): void {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(history, null, 2));
}

function formatOutput(current: LintStats, previous?: LintStats): void {
  console.log("\n📊 Linting Progress Report");
  console.log("═".repeat(50));

  console.log(`\n📅 Timestamp: ${new Date(current.timestamp).toLocaleString()}`);
  console.log(`\n📈 Current Status:`);
  console.log(`   Total Issues: ${current.totalIssues}`);
  console.log(`   Errors: ${current.errors}`);
  console.log(`   Warnings: ${current.warnings}`);

  if (previous) {
    const totalDiff = current.totalIssues - previous.totalIssues;
    const errorDiff = current.errors - previous.errors;
    const warningDiff = current.warnings - previous.warnings;

    console.log(`\n📊 Progress Since Last Check:`);
    console.log(
      `   Total: ${totalDiff >= 0 ? "+" : ""}${totalDiff} (${previous.totalIssues} → ${current.totalIssues})`,
    );
    console.log(`   Errors: ${errorDiff >= 0 ? "+" : ""}${errorDiff} (${previous.errors} → ${current.errors})`);
    console.log(
      `   Warnings: ${warningDiff >= 0 ? "+" : ""}${warningDiff} (${previous.warnings} → ${current.warnings})`,
    );

    if (totalDiff < 0) {
      console.log(
        `\n✅ Great progress! You've fixed ${Math.abs(totalDiff)} issue${Math.abs(totalDiff) !== 1 ? "s" : ""}!`,
      );
    } else if (totalDiff > 0) {
      console.log(`\n⚠️  ${totalDiff} new issue${totalDiff !== 1 ? "s" : ""} introduced.`);
    } else {
      console.log(`\n↔️  No change in issue count.`);
    }
  }

  console.log(`\n📁 Issues by File (Top 5):`);
  const fileEntries = Object.entries(current.byFile)
    .toSorted(([, a], [, b]) => b - a)
    .slice(0, 5);

  for (const [file, count] of fileEntries) {
    const shortPath = file.replace(process.cwd(), ".");
    console.log(`   ${count.toString().padStart(3)} ${shortPath}`);
  }

  console.log(`\n📏 Issues by Rule (Top 5):`);
  const ruleEntries = Object.entries(current.byRule)
    .toSorted(([, a], [, b]) => b - a)
    .slice(0, 5);

  for (const [rule, count] of ruleEntries) {
    console.log(`   ${count.toString().padStart(3)} ${rule}`);
  }

  console.log("\n" + "═".repeat(50));

  if (current.totalIssues === 0) {
    console.log("\n🎉 Congratulations! All linting issues have been resolved!");
  } else {
    console.log(`\n💡 Tips for fixing issues:`);
    console.log(`   • Run 'bun run lint:es' to see all issues`);
    console.log(`   • Run 'bun run lint:errors' to see only errors`);
    console.log(`   • Most warnings are safe to fix gradually`);
    console.log(`   • Focus on errors first, then warnings`);
  }

  console.log();
}

// Main execution
function main() {
  console.log("🔍 Running lint check...\n");

  const output = runLintCheck();
  const current = parseLintOutput(output);

  const history = loadProgress();
  const previous = history[history.length - 1];

  // Add current stats to history
  history.push(current);

  // Keep only last 100 entries
  if (history.length > 100) {
    history.splice(0, history.length - 100);
  }

  saveProgress(history);

  formatOutput(current, previous);

  // Exit with success (0) so this doesn't fail builds
  process.exit(0);
}

main();
