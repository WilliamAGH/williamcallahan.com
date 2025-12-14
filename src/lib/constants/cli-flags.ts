/**
 * CLI Flag Constants for Data Updater Operations
 *
 * Single source of truth for all CLI flags used by:
 * - scripts/data-updater.ts (CLI entrypoint)
 * - lib/server/scheduler.ts (cron scheduler)
 * - lib/server/data-fetch-manager.ts (orchestrator)
 *
 * CRITICAL: The scheduler spawns data-updater with these exact flags.
 * Any mismatch causes silent failures where jobs appear to run but do nothing.
 *
 * @module constants/cli-flags
 */

import type { DataUpdaterFlag } from "@/types/lib";

// Re-export type for consumers
export type { DataUpdaterFlag } from "@/types/lib";

/**
 * CLI flags for data updater operations
 * These flags control which data operations are executed
 */
export const DATA_UPDATER_FLAGS = {
  /** Refresh bookmarks data from external API */
  BOOKMARKS: "--bookmarks",
  /** Refresh GitHub activity data - NOTE: NOT --github-activity! */
  GITHUB: "--github",
  /** Refresh company logos from various sources */
  LOGOS: "--logos",
  /** Rebuild search indexes for all content types */
  SEARCH_INDEXES: "--search-indexes",
  /** Force refresh regardless of freshness checks */
  FORCE: "--force",
  /** Only refresh metadata (titles/descriptions) for bookmarks */
  METADATA_ONLY: "--metadata-only",
  /** Limit items in metadata refresh mode */
  METADATA_LIMIT: "--metadata-limit",
  /** Prefix for test limit flag (e.g., --testLimit=100) */
  TEST_LIMIT_PREFIX: "--testLimit=",
  /** Show help message */
  HELP: "--help",
  /** Short help flag */
  HELP_SHORT: "-h",
  /** Allow S3 writes during build phase (not recommended) */
  ALLOW_BUILD_WRITES: "--allow-build-writes",
} as const satisfies Record<string, DataUpdaterFlag>;

/**
 * Check if command line arguments include a specific flag
 *
 * @param args - Array of command line arguments
 * @param flag - Flag to check for
 * @returns true if the flag is present in args
 *
 * @example
 * ```ts
 * const args = process.argv.slice(2);
 * if (hasFlag(args, DATA_UPDATER_FLAGS.GITHUB)) {
 *   // Run GitHub refresh
 * }
 * ```
 */
export function hasFlag(args: readonly string[], flag: DataUpdaterFlag): boolean {
  return args.includes(flag);
}

/**
 * Extract a value from a flag like --testLimit=100
 *
 * @param args - Array of command line arguments
 * @param flagPrefix - Prefix to search for (e.g., "--testLimit=")
 * @returns The value portion after the equals sign, or undefined if not found
 *
 * @example
 * ```ts
 * const args = ["--github", "--testLimit=50"];
 * const limit = getFlagValue(args, DATA_UPDATER_FLAGS.TEST_LIMIT_PREFIX);
 * // limit === "50"
 * ```
 */
export function getFlagValue(args: readonly string[], flagPrefix: string): string | undefined {
  const arg = args.find(a => a.startsWith(flagPrefix));
  return arg?.split("=")[1];
}

/**
 * Parse test limit from command line arguments
 *
 * @param args - Array of command line arguments
 * @returns Parsed limit number, or undefined if not specified or invalid
 */
export function parseTestLimit(args: readonly string[]): number | undefined {
  const limitStr = getFlagValue(args, DATA_UPDATER_FLAGS.TEST_LIMIT_PREFIX);
  if (!limitStr?.trim()) return undefined;

  const limit = parseInt(limitStr, 10);
  if (Number.isNaN(limit) || limit <= 0 || limit > 10000) {
    return undefined;
  }
  return limit;
}
