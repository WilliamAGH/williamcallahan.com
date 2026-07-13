// Load environment variables first
import { loadEnvironmentWithMultilineSupport } from "@/lib/utils/env-loader";
import { getMonotonicTime } from "@/lib/utils";
import { getBaseUrl } from "@/lib/utils/get-base-url";
import { writeFileSync } from "node:fs";
loadEnvironmentWithMultilineSupport();

let fatalExitStarted = false;

const exitAfterFatalProcessError = (event: string, reason: unknown): void => {
  if (fatalExitStarted) return;
  fatalExitStarted = true;
  console.error(`[Scheduler] FATAL: ${event}`, reason);
  process.exitCode = 1;
  setImmediate(() => process.exit(1));
};

process.on("uncaughtException", (error) => {
  exitAfterFatalProcessError("Uncaught exception", error);
});

process.on("unhandledRejection", (reason) => {
  exitAfterFatalProcessError("Unhandled promise rejection", reason);
});

console.log(
  `[Scheduler] Starting at ${new Date().toISOString()} with Node ${process.version} in ${process.cwd()}`,
);

// Continuous Background Scheduler
//
// This is a long-running process that schedules and triggers data update tasks
// at specified intervals:
// - Bookmarks: Every 2 hours (refreshes external bookmarks data)
// - Bookmark Tags: Every 4 hours (LLM canonical tag + alias ingestion)
// - Bookmark Tags Retrofit: Daily at 3:45 AM PT (tag-alias catch-up)
// - Books: Daily at 6 AM PT (regenerates consolidated books dataset from ABS)
// - GitHub Activity: Daily at midnight PT (refreshes GitHub contribution data)
// - Logos: Weekly on Sunday at 1 AM PT (refreshes company logos)
//
// How it works:
// 1. The scheduler starts via 'node --run scheduler' (typically from entrypoint.sh)
// 2. It registers cron patterns for each task type
// 3. It remains running indefinitely, waiting for scheduled times to trigger
// 4. When triggered, it executes the update-data script with appropriate arguments
// 5. The process continues running after task completion, waiting for next trigger
//
// Configuration:
// - Override schedules via environment variables:
//   - S3_BOOKMARKS_CRON (default: every 2 hours at minute 0)
//   - S3_BOOKMARK_TAGS_CRON (default: every 4 hours at minute 30)
//   - S3_BOOKMARK_TAGS_RETROFIT_CRON (default: daily at 3:45 AM PT)
//   - S3_BOOKS_CRON (default: daily at 6 AM PT)
//   - S3_GITHUB_CRON (default: daily at midnight)
//   - S3_LOGOS_CRON (default: weekly on Sunday at 1 AM)
// - All times are in Pacific Time (America/Los_Angeles)
//
// Production Refresh Frequencies:
// - Bookmarks: 12 times/day (every 2 hours) - optimal for content freshness
// - Bookmark Tags: 6 times/day (every 4 hours) - keeps canonical tag aliases fresh
// - Bookmark Tags Retrofit: 1 time/day - captures bookmarks missing tag alias review
// - Books: 1 time/day (6 AM PT) - books change infrequently
// - GitHub Activity: 1 time/day (midnight) - sufficient for contribution data
// - Logos: 1 time/week (Sunday 1 AM) - logos rarely change, reduces API load
//
// Note: This process must stay running for scheduled updates to occur.

// Import required modules
import { randomInt } from "node:crypto";
import rawCron from "node-cron";
import { spawn } from "node:child_process";
import { DATA_UPDATER_FLAGS } from "@/lib/constants/cli-flags";

// Verify modules loaded
console.log("[Scheduler] All required modules loaded successfully");

// Maximum random jitter for scheduled tasks: 15 minutes
const DEFAULT_JITTER_MS = 15 * 60 * 1000;

// Generate unique instance ID for this scheduler
const SCHEDULER_INSTANCE_ID = `scheduler-${randomInt(1000000, 9999999)}-${Math.floor(getMonotonicTime())}`;

// Track running jobs to prevent concurrent executions
const runningJobs = new Set<string>();

console.log(
  `[Scheduler] Process started with instanceId: ${SCHEDULER_INSTANCE_ID}. Setting up cron jobs...`,
);
// Ensure Node Cron interprets times in PT
process.env.TZ = "America/Los_Angeles";
console.log("[Scheduler] Starting update-data scheduler (PT)...");
// Typed wrapper around node-cron to avoid any-typed calls
const cron = rawCron as { schedule: (expression: string, task: () => void) => void };

// Cron expressions (minute hour day month weekday)
// Staggered timing to prevent resource contention
const bookmarksCron = process.env.S3_BOOKMARKS_CRON || "0 */2 * * *"; // every 2h at minute 0 (12x/day)
const bookmarkTagsCron = process.env.S3_BOOKMARK_TAGS_CRON || "30 */4 * * *"; // every 4h at minute 30 (6x/day)
const bookmarkTagsRetrofitCron = process.env.S3_BOOKMARK_TAGS_RETROFIT_CRON || "45 3 * * *"; // daily at 3:45 AM PT
const booksCron = process.env.S3_BOOKS_CRON || "0 6 * * *"; // daily at 6 AM PT (1x/day)
const githubCron = process.env.S3_GITHUB_CRON || "0 0 * * *"; // daily at midnight (1x/day)
const logosCron = process.env.S3_LOGOS_CRON || "0 1 * * 0"; // weekly Sunday at 1 AM (1x/week)
const REVALIDATE_BOOTSTRAP_CACHES_FLAG = "--revalidate-bootstrap-caches";

const CACHE_REVALIDATION_TARGETS = {
  Bookmarks: {
    path: "/api/revalidate/bookmarks",
    authSecretKey: "BOOKMARK_CRON_REFRESH_SECRET",
  },
  Books: {
    path: "/api/revalidate/books",
    authSecretKey: "BOOKMARK_CRON_REFRESH_SECRET",
  },
  GitHub: {
    path: "/api/revalidate/github-activity",
    authSecretKey: "BOOKMARK_CRON_REFRESH_SECRET",
  },
} as const satisfies Record<
  string,
  { path: string; authSecretKey: "BOOKMARK_CRON_REFRESH_SECRET" }
>;

async function invalidateWebCache(
  name: string,
  target: (typeof CACHE_REVALIDATION_TARGETS)[keyof typeof CACHE_REVALIDATION_TARGETS],
): Promise<{ success: true } | { success: false; error: Error }> {
  console.log(`[Scheduler] [${name}] Invalidating cache: ${target.path}`);
  const secret = process.env[target.authSecretKey];
  if (!secret) {
    const error = new Error(`${target.authSecretKey} is not configured`);
    console.error(`[Scheduler] [${name}] ${error.message}`);
    return { success: false, error };
  }

  const revalidateUrl = new URL(target.path, getBaseUrl()).toString();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(revalidateUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error(`Cache invalidation failed: ${response.status}`);
      console.error(`[Scheduler] [${name}] ${error.message}`);
      return { success: false, error };
    }

    console.log(`[Scheduler] [${name}] ✅ Cache invalidated`);
    return { success: true };
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    console.error(`[Scheduler] [${name}] Cache invalidation error:`, failure);
    return { success: false, error: failure };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function revalidateBootstrapCaches(): Promise<void> {
  const results = await Promise.all(
    Object.entries(CACHE_REVALIDATION_TARGETS).map(([name, target]) =>
      invalidateWebCache(name, target),
    ),
  );

  if (results.some((result) => !result.success)) {
    console.error("[Scheduler] Bootstrap cache revalidation failed");
    process.exit(1);
  }

  console.log("[Scheduler] Bootstrap caches revalidated");
  process.exit(0);
}

/**
 * Schedule a recurring data update job.
 * Handles jitter, concurrency locks, process spawning, and cache invalidation.
 */
const scheduleCronJob = (
  name: string,
  schedule: string,
  flag: string,
  revalidationTarget?: (typeof CACHE_REVALIDATION_TARGETS)[keyof typeof CACHE_REVALIDATION_TARGETS],
) => {
  console.log(`[Scheduler] ${name} schedule: ${schedule}`);
  cron.schedule(schedule, () => {
    const now = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
    console.log(`[Scheduler] [${SCHEDULER_INSTANCE_ID}] [${name}] Triggered at ${now}`);

    const jitter = randomInt(DEFAULT_JITTER_MS);
    console.log(`[Scheduler] [${SCHEDULER_INSTANCE_ID}] [${name}] Jitter: ${jitter}ms`);

    setTimeout(() => {
      if (runningJobs.has(name)) {
        console.warn(`[Scheduler] [${SCHEDULER_INSTANCE_ID}] [${name}] Already running, skipping`);
        return;
      }
      runningJobs.add(name);

      console.log(
        `[Scheduler] [${SCHEDULER_INSTANCE_ID}] [${name}] Spawning: node --run update-data -- ${flag}`,
      );

      const updateProcess = spawn("node", ["--run", "update-data", "--", flag], {
        env: process.env,
        stdio: "inherit",
        detached: false,
      });

      updateProcess.on("error", (err) => {
        console.error(
          `[Scheduler] [${SCHEDULER_INSTANCE_ID}] [${name}] Failed to start process:`,
          err,
        );
      });

      updateProcess.on("close", (code) => {
        runningJobs.delete(name);

        if (code !== 0) {
          console.error(
            `[Scheduler] [${SCHEDULER_INSTANCE_ID}] [${name}] Script failed (code ${code})`,
          );
          return;
        }

        console.log(`[Scheduler] [${SCHEDULER_INSTANCE_ID}] [${name}] Script completed`);

        if (name === "Logos") {
          return; // Logos don't need explicit revalidation (handled by manifest reload)
        }

        if (revalidationTarget) {
          void invalidateWebCache(name, revalidationTarget);
        }

        if (name === "Bookmarks") {
          console.log(`[Scheduler] [${name}] Submitting sitemap...`);
          const sitemapProcess = spawn("node", ["--run", "submit-sitemap"], {
            env: process.env,
            stdio: "inherit",
          });
          sitemapProcess.on("error", (err) => {
            console.warn(`[Scheduler] [${name}] Sitemap submission failed to start:`, err);
          });
          sitemapProcess.on("close", (sitemapCode) => {
            if (sitemapCode !== 0) {
              console.warn(
                `[Scheduler] [${name}] Sitemap submission exited with code ${sitemapCode}`,
              );
            }
          });
        }
      });
    }, jitter);
  });
};

if (process.argv.includes(REVALIDATE_BOOTSTRAP_CACHES_FLAG)) {
  await revalidateBootstrapCaches();
}

// Register Jobs
scheduleCronJob(
  "Bookmarks",
  bookmarksCron,
  DATA_UPDATER_FLAGS.BOOKMARKS,
  CACHE_REVALIDATION_TARGETS.Bookmarks,
);

scheduleCronJob(
  "BookmarkTags",
  bookmarkTagsCron,
  DATA_UPDATER_FLAGS.BOOKMARK_TAGS,
  CACHE_REVALIDATION_TARGETS.Bookmarks,
);

scheduleCronJob(
  "BookmarkTagsRetrofit",
  bookmarkTagsRetrofitCron,
  DATA_UPDATER_FLAGS.BOOKMARK_TAGS_RETROFIT,
  CACHE_REVALIDATION_TARGETS.Bookmarks,
);

scheduleCronJob("Books", booksCron, DATA_UPDATER_FLAGS.BOOKS, CACHE_REVALIDATION_TARGETS.Books);

// CRITICAL: Use --github flag (mapped to GITHUB constant), NOT --github-activity
scheduleCronJob("GitHub", githubCron, DATA_UPDATER_FLAGS.GITHUB, CACHE_REVALIDATION_TARGETS.GitHub);

scheduleCronJob("Logos", logosCron, DATA_UPDATER_FLAGS.LOGOS);

// The scheduler process remains alive indefinitely, waiting for cron events.
// DO NOT EXIT this process - it must stay running for scheduled updates to occur.
console.log(
  "[Scheduler] Setup complete. Scheduler is running and waiting for scheduled trigger times...",
);
console.log(
  "[Scheduler] Production frequencies: Bookmarks (12x/day), BookmarkTags (6x/day), BookmarkTagsRetrofit (1x/day), Books (1x/day), GitHub (1x/day), Logos (1x/week)",
);

const heartbeatFile = process.env.SCHEDULER_HEARTBEAT_FILE ?? "/tmp/scheduler-heartbeat";
const writeHeartbeat = (): void => writeFileSync(heartbeatFile, String(Date.now()), "utf8");

writeHeartbeat();
setInterval(writeHeartbeat, 30_000).unref();

// Log heartbeat every hour to confirm scheduler is alive
setInterval(
  () => {
    const uptime = Math.floor(process.uptime() / 60);
    console.log(
      `[Scheduler] Heartbeat: Process alive for ${uptime} minutes, waiting for scheduled tasks...`,
    );
  },
  60 * 60 * 1000,
);

// Log immediate heartbeat
console.log(`[Scheduler] Initial heartbeat: Process ${SCHEDULER_INSTANCE_ID} is running`);
