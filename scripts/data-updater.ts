#!/usr/bin/env tsx

import type { DataFetchConfig, DataFetchOperationSummary } from "@/types/lib";
import logger from "@/lib/utils/logger";
import { loadEnvironmentWithMultilineSupport } from "@/lib/utils/env-loader";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { DATA_UPDATER_FLAGS, hasFlag, parseTestLimit } from "@/lib/constants/cli-flags";

loadEnvironmentWithMultilineSupport();

process.env.IS_DATA_UPDATER = "true";

const args = process.argv.slice(2);
const LAST_RUN_SUCCESS_FILE = join(process.cwd(), ".populate-volumes-last-run-success");
const LAST_RUN_DETAILS_FILE = join(process.cwd(), ".data-update-details.json");
const RUN_INTERVAL_HOURS = 12;
const LEGACY_CATEGORY_FLAGS = new Set(["--bookmark-categories", "--bookmark-categories-retrofit"]);

function hasTagOperation(argsToCheck: readonly string[]): boolean {
  return (
    hasFlag(argsToCheck, DATA_UPDATER_FLAGS.BOOKMARK_TAGS) ||
    hasFlag(argsToCheck, DATA_UPDATER_FLAGS.BOOKMARK_TAGS_RETROFIT)
  );
}

function buildTagScriptArgs(
  sourceArgs: readonly string[],
  mode: "incremental" | "retrofit",
  testLimit?: number,
): string[] {
  const forwarded: string[] = [];
  let hasExplicitLimit = false;

  for (let i = 0; i < sourceArgs.length; i += 1) {
    const value = sourceArgs[i];
    if (!value) continue;
    if (value === "--bookmark-id" || value === "--limit" || value === "--related-limit") {
      if (value === "--limit") hasExplicitLimit = true;
      const next = sourceArgs[i + 1];
      if (next) {
        forwarded.push(value, next);
        i += 1;
      }
      continue;
    }
    if (
      value.startsWith("--bookmark-id=") ||
      value.startsWith("--limit=") ||
      value.startsWith("--related-limit=")
    ) {
      if (value.startsWith("--limit=")) hasExplicitLimit = true;
      forwarded.push(value);
      continue;
    }
    if (value === "--dry-run") forwarded.push(value);
  }

  if (!hasExplicitLimit && testLimit && testLimit > 0) forwarded.push(`--limit=${testLimit}`);
  if (mode === "retrofit" && !forwarded.includes("--retrofit")) forwarded.push("--retrofit");
  return forwarded;
}

async function runTagIngestionTask(
  mode: "incremental" | "retrofit",
  sourceArgs: readonly string[],
  testLimit?: number,
): Promise<DataFetchOperationSummary> {
  const operation = mode === "retrofit" ? "bookmark-tags-retrofit" : "bookmark-tags";
  const startedAt = Date.now();
  const scriptArgs = buildTagScriptArgs(sourceArgs, mode, testLimit);

  logger.info(
    `[DataUpdaterCLI] Starting ${operation} with args: ${scriptArgs.length > 0 ? scriptArgs.join(" ") : "(none)"}`,
  );

  return new Promise((resolve) => {
    const child = spawn("node", ["scripts/ingest-bookmark-tag-aliases.node.mjs", ...scriptArgs], {
      env: process.env,
      stdio: "inherit",
      detached: false,
    });

    child.once("error", (error) => {
      resolve({
        success: false,
        operation,
        error: error instanceof Error ? error.message : String(error),
        duration: (Date.now() - startedAt) / 1000,
      });
    });

    child.once("close", (code) => {
      resolve({
        success: code === 0,
        operation,
        error: code === 0 ? undefined : `Tag ingestion exited with code ${code ?? -1}`,
        duration: (Date.now() - startedAt) / 1000,
      });
    });
  });
}

async function checkRecentRun(): Promise<boolean> {
  if (process.env.NODE_ENV !== "development" || hasFlag(args, DATA_UPDATER_FLAGS.FORCE)) {
    return false;
  }

  if (
    hasFlag(args, DATA_UPDATER_FLAGS.BOOKMARKS) ||
    hasFlag(args, DATA_UPDATER_FLAGS.BOOKS) ||
    hasFlag(args, DATA_UPDATER_FLAGS.GITHUB) ||
    hasFlag(args, DATA_UPDATER_FLAGS.LOGOS) ||
    hasFlag(args, DATA_UPDATER_FLAGS.SEARCH_INDEXES) ||
    hasTagOperation(args)
  ) {
    return false;
  }

  if (!existsSync(LAST_RUN_SUCCESS_FILE)) {
    return false;
  }

  try {
    const timestampContent = await readFile(LAST_RUN_SUCCESS_FILE, "utf-8");
    const lastRunTime = new Date(timestampContent.trim()).getTime();
    const hoursSinceLastRun = (Date.now() - lastRunTime) / (1000 * 60 * 60);

    if (hoursSinceLastRun < RUN_INTERVAL_HOURS) {
      console.log(
        `✅ Data updated within the last ${RUN_INTERVAL_HOURS} hours (${hoursSinceLastRun.toFixed(2)}h ago). Skipping update.`,
      );
      return true;
    }
  } catch (error) {
    logger.warn("Error checking last run timestamp:", error);
  }

  return false;
}

async function updateTimestamp(results: DataFetchOperationSummary[]): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    try {
      await writeFile(LAST_RUN_SUCCESS_FILE, new Date().toISOString());
      const details = {
        lastRun: new Date().toISOString(),
        results: results.reduce(
          (acc, result) => {
            acc[result.operation] = {
              success: result.success,
              itemsProcessed: result.itemsProcessed || 0,
              error: result.error,
              duration: result.duration,
            };
            return acc;
          },
          {} as Record<string, unknown>,
        ),
      };
      await writeFile(LAST_RUN_DETAILS_FILE, JSON.stringify(details, null, 2));
    } catch (error) {
      logger.warn("Error updating timestamp:", error);
    }
  }
}

if (hasFlag(args, DATA_UPDATER_FLAGS.METADATA_ONLY)) {
  process.env.BOOKMARK_METADATA_ONLY_REFRESH = "true";
  const limitIndex = args.indexOf(DATA_UPDATER_FLAGS.METADATA_LIMIT);
  if (limitIndex !== -1 && args[limitIndex + 1]) {
    process.env.BOOKMARK_METADATA_REFRESH_LIMIT = args[limitIndex + 1];
  }
  console.log("📝 Metadata-only refresh mode enabled for bookmarks");
}

// Handle help flag
if (hasFlag(args, DATA_UPDATER_FLAGS.HELP) || hasFlag(args, DATA_UPDATER_FLAGS.HELP_SHORT)) {
  console.log(`Usage: data-fetch-manager [options]

Options:
  --bookmarks          Fetch and update bookmarks data
  --bookmark-tags       Run bookmark tag canonicalization + alias ingestion
  --bookmark-tags-retrofit Run retrofit pass for bookmarks missing tag-alias review
  --bookmark-id ID      Restrict tag ingestion to one bookmark
  --related-limit N     Tag ingestion context size for similar bookmarks (default: 8)
  --limit N             Max bookmarks to process for tag ingestion (default: 1)
  --books              Regenerate books dataset from AudioBookShelf
  --metadata-only      Use lightweight metadata refresh (titles/descriptions only)
  --metadata-limit N   Max items to refresh in metadata mode (default: 50)
  --github             Fetch and update GitHub activity data
  --logos              Fetch and update logos for all domains
  --search-indexes     Build and update search indexes
  --force              Force refresh of all data
  --testLimit=N        Limit operations to N items for testing
  --help, -h           Show this help message

If no options are specified, all operations will run (bookmarks, books, github, logos, search-indexes).

Environment Variables:
  DRY_RUN=true         Skip all update processes (dry run mode)
  S3_BUCKET            S3 bucket name for data storage
  S3_TEST_LIMIT        Test limit for S3 operations`);
  process.exit(0);
}

const legacyCategoryFlagsUsed = args.filter((arg) => LEGACY_CATEGORY_FLAGS.has(arg));
if (legacyCategoryFlagsUsed.length > 0) {
  console.error("[DataUpdaterCLI] Legacy bookmark category flags were removed.");
  for (const flag of legacyCategoryFlagsUsed) {
    console.error(`  - ${flag}`);
  }
  console.error("Use bookmark tag operations only: --bookmark-tags or --bookmark-tags-retrofit.");
  process.exit(1);
}

logger.info(`[DataFetchManager] CLI execution started. Args: ${args.join(" ")}`);

if (
  process.env.NEXT_PHASE === "phase-production-build" &&
  !hasFlag(args, DATA_UPDATER_FLAGS.ALLOW_BUILD_WRITES)
) {
  console.warn("⚠️  WARNING: data-updater called during Next.js build phase");
  console.warn("⚠️  S3 writes during build are now disabled to prevent build-time mutations");
  console.warn("⚠️  Data updates should happen via runtime scheduler or manual execution");
  console.warn("⚠️  Use --allow-build-writes flag to force (not recommended)");
  process.exit(0);
}

if (process.env.DRY_RUN === "true") {
  console.log("DRY RUN mode - skipping all update processes");
  logger.info(`Args: ${args.join(" ")}`);
  if (process.env.S3_TEST_LIMIT) {
    console.log(`Test limit active: ${process.env.S3_TEST_LIMIT} items per operation`);
  }

  process.exit(0);
}

const config: DataFetchConfig = {};
const hasSpecificOperation =
  hasFlag(args, DATA_UPDATER_FLAGS.BOOKMARKS) ||
  hasTagOperation(args) ||
  hasFlag(args, DATA_UPDATER_FLAGS.BOOKS) ||
  hasFlag(args, DATA_UPDATER_FLAGS.LOGOS) ||
  hasFlag(args, DATA_UPDATER_FLAGS.GITHUB) ||
  hasFlag(args, DATA_UPDATER_FLAGS.SEARCH_INDEXES);

if (!hasSpecificOperation) {
  config.bookmarks = true;
  config.books = true;
  config.logos = true;
  config.githubActivity = true;
  config.searchIndexes = true;
} else {
  if (hasFlag(args, DATA_UPDATER_FLAGS.BOOKMARKS)) {
    config.bookmarks = true;
  }
  if (hasFlag(args, DATA_UPDATER_FLAGS.BOOKS)) {
    config.books = true;
  }
  if (hasFlag(args, DATA_UPDATER_FLAGS.LOGOS)) {
    config.logos = true;
  }
  if (hasFlag(args, DATA_UPDATER_FLAGS.GITHUB)) {
    config.githubActivity = true;
  }
  if (hasFlag(args, DATA_UPDATER_FLAGS.SEARCH_INDEXES)) {
    config.searchIndexes = true;
  }
}

if (hasFlag(args, DATA_UPDATER_FLAGS.FORCE)) {
  config.forceRefresh = true;
}

const testLimit = parseTestLimit(args);
if (testLimit !== undefined) {
  config.testLimit = testLimit;
  logger.info(`[DataUpdaterCLI] Applying test limit of ${testLimit}`);
}

(async () => {
  const shouldSkip = await checkRecentRun();
  if (shouldSkip) {
    process.exit(0);
  }

  try {
    const { DataFetchManager } = await import("@/lib/server/data-fetch-manager");
    const manager = new DataFetchManager();
    const tagResults: DataFetchOperationSummary[] = [];
    if (hasFlag(args, DATA_UPDATER_FLAGS.BOOKMARK_TAGS)) {
      tagResults.push(await runTagIngestionTask("incremental", args, testLimit));
    }
    if (hasFlag(args, DATA_UPDATER_FLAGS.BOOKMARK_TAGS_RETROFIT)) {
      tagResults.push(await runTagIngestionTask("retrofit", args, testLimit));
    }

    const managerResults = await manager.fetchData(config);
    const results = [...tagResults, ...managerResults];

    logger.info("[DataUpdaterCLI] All tasks complete.");

    results.forEach((result) => {
      if (result.success) {
        logger.info(
          `  - ${result.operation}: Success (${result.itemsProcessed} items, duration: ${result.duration}s)`,
        );
      } else {
        logger.error(
          `  - ${result.operation}: Failed (${result.error}, duration: ${result.duration}s)`,
        );
      }
    });

    console.log("\n--- Data Updater Final Summary ---");
    console.table(
      results.map((r) => ({
        Operation: r.operation,
        Success: r.success ? "✅" : "❌",
        "Items Processed": r.itemsProcessed ?? "N/A",
        "Duration (s)": r.duration,
        Error: r.error || "None",
      })),
    );
    console.log("------------------------------------\n");

    await updateTimestamp(results);

    const githubResult = results.find((r) => r.operation === "github-activity");
    if (githubResult && !githubResult.success && githubResult.error?.includes("rate")) {
      logger.warn(
        "[DataUpdaterCLI] GitHub activity failed due to rate limiting. Will retry after cooldown period.",
      );
    }

    const hasFailures = results.some((r) => !r.success);
    if (hasFailures) {
      logger.error("[DataUpdaterCLI] One or more operations failed. Exiting with status 1.");
      process.exit(1);
    }

    process.exit(0);
  } catch (error: unknown) {
    logger.error("[DataUpdaterCLI] An unexpected error occurred:", error);
    process.exit(1);
  }
})();
