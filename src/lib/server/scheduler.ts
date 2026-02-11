// Load environment variables first
import { loadEnvironmentWithMultilineSupport } from "@/lib/utils/env-loader";
import { getMonotonicTime } from "@/lib/utils";
import { getBaseUrl } from "@/lib/utils/get-base-url";
loadEnvironmentWithMultilineSupport();

// Log startup immediately to verify process is running
console.log(`[Scheduler] Process starting at ${new Date().toISOString()}`);
console.log(
  `[Scheduler] Node version: ${process.version}, Bun version: ${process.versions.bun || "N/A"}`,
);
console.log(`[Scheduler] Working directory: ${process.cwd()}`);

// Continuous Background Scheduler
//
// This is a long-running process that schedules and triggers data update tasks
// at specified intervals:
// - Bookmarks: Every 2 hours (refreshes external bookmarks data)
// - Books: Daily at 6 AM PT (regenerates consolidated books dataset from ABS)
// - GitHub Activity: Daily at midnight PT (refreshes GitHub contribution data)
// - Logos: Weekly on Sunday at 1 AM PT (refreshes company logos)
//
// How it works:
// 1. The scheduler starts via 'bun run scheduler' (typically from entrypoint.sh)
// 2. It registers cron patterns for each task type
// 3. It remains running indefinitely, waiting for scheduled times to trigger
// 4. When triggered, it executes the update-s3 script with appropriate arguments
// 5. The process continues running after task completion, waiting for next trigger
//
// Configuration:
// - Override schedules via environment variables:
//   - S3_BOOKMARKS_CRON (default: every 2 hours at minute 0)
//   - S3_BOOKS_CRON (default: daily at 6 AM PT)
//   - S3_GITHUB_CRON (default: daily at midnight)
//   - S3_LOGOS_CRON (default: weekly on Sunday at 1 AM)
// - All times are in Pacific Time (America/Los_Angeles)
//
// Production Refresh Frequencies:
// - Bookmarks: 12 times/day (every 2 hours) - optimal for content freshness
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
// Debug: log key environment variables
console.log(
  `[Scheduler] [${SCHEDULER_INSTANCE_ID}] Env vars: S3_BUCKET=${process.env.S3_BUCKET}, ` +
    `S3_SERVER_URL=${process.env.S3_SERVER_URL}, PATH=${process.env.PATH}`,
);

// Ensure Node Cron interprets times in PT
process.env.TZ = "America/Los_Angeles";
console.log("[Scheduler] Starting update-s3-data scheduler (PT)...");
// Typed wrapper around node-cron to avoid any-typed calls
const cron = rawCron as { schedule: (expression: string, task: () => void) => void };

// Cron expressions (minute hour day month weekday)
// Staggered timing to prevent resource contention
const bookmarksCron = process.env.S3_BOOKMARKS_CRON || "0 */2 * * *"; // every 2h at minute 0 (12x/day)
const booksCron = process.env.S3_BOOKS_CRON || "0 6 * * *"; // daily at 6 AM PT (1x/day)
const githubCron = process.env.S3_GITHUB_CRON || "0 0 * * *"; // daily at midnight (1x/day)
const logosCron = process.env.S3_LOGOS_CRON || "0 1 * * 0"; // weekly Sunday at 1 AM (1x/week)

/**
 * Schedule a recurring data update job.
 * Handles jitter, concurrency locks, process spawning, and cache invalidation.
 */
const scheduleCronJob = (
  name: string,
  schedule: string,
  flag: string,
  revalidatePath?: string,
  authSecretKey?: string,
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
        `[Scheduler] [${SCHEDULER_INSTANCE_ID}] [${name}] Spawning: bun run update-s3 -- ${flag}`,
      );

      const updateProcess = spawn("bun", ["run", "update-s3", "--", flag], {
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

        if (revalidatePath) {
          console.log(`[Scheduler] [${name}] Invalidating cache: ${revalidatePath}`);
          const apiUrl = getBaseUrl();
          const revalidateUrl = new URL(revalidatePath, apiUrl).toString();
          const secret = authSecretKey ? process.env[authSecretKey] : undefined;
          const headers = secret ? { Authorization: `Bearer ${secret}` } : undefined;

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10_000);

          fetch(revalidateUrl, { method: "POST", headers, signal: controller.signal })
            .then((res) => {
              clearTimeout(timeoutId);
              if (res.ok) console.log(`[Scheduler] [${name}] ✅ Cache invalidated`);
              else console.error(`[Scheduler] [${name}] Cache invalidation failed: ${res.status}`);
              return null;
            })
            .catch((err) => {
              clearTimeout(timeoutId);
              console.error(`[Scheduler] [${name}] Cache invalidation error:`, err);
              return null;
            });
        }

        if (name === "Bookmarks") {
          console.log(`[Scheduler] [${name}] Submitting sitemap...`);
          spawn("bun", ["run", "submit-sitemap"], { env: process.env, stdio: "inherit" });
        }
      });
    }, jitter);
  });
};

// Register Jobs
scheduleCronJob(
  "Bookmarks",
  bookmarksCron,
  DATA_UPDATER_FLAGS.BOOKMARKS,
  "/api/revalidate/bookmarks",
  "BOOKMARK_CRON_REFRESH_SECRET",
);

scheduleCronJob(
  "Books",
  booksCron,
  DATA_UPDATER_FLAGS.BOOKS,
  "/api/revalidate/books",
  "BOOKMARK_CRON_REFRESH_SECRET",
);

// CRITICAL: Use --github flag (mapped to GITHUB constant), NOT --github-activity
scheduleCronJob(
  "GitHub",
  githubCron,
  DATA_UPDATER_FLAGS.GITHUB,
  "/api/revalidate/github-activity",
  "GITHUB_CRON_REFRESH_SECRET",
);

scheduleCronJob("Logos", logosCron, DATA_UPDATER_FLAGS.LOGOS);

// The scheduler process remains alive indefinitely, waiting for cron events.
// DO NOT EXIT this process - it must stay running for scheduled updates to occur.
console.log(
  "[Scheduler] Setup complete. Scheduler is running and waiting for scheduled trigger times...",
);
console.log(
  "[Scheduler] Production frequencies: Bookmarks (12x/day), Books (1x/day), GitHub (1x/day), Logos (1x/week)",
);

// Add process-level error handling to prevent silent crashes
process.on("uncaughtException", (error) => {
  console.error(`[Scheduler] FATAL: Uncaught exception:`, error);
  console.error(`[Scheduler] Stack trace:`, error.stack);
  // Don't exit - try to keep running
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(`[Scheduler] ERROR: Unhandled promise rejection:`, reason);
  console.error(`[Scheduler] Promise:`, promise);
  // Don't exit - try to keep running
});

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
