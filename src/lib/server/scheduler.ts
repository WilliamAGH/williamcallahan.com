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

console.log(`[Scheduler] Bookmarks schedule: ${bookmarksCron} (every 2 hours)`);
cron.schedule(bookmarksCron, () => {
  console.log(
    `[Scheduler] [${SCHEDULER_INSTANCE_ID}] [Bookmarks] Cron triggered at ${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}. Preparing to spawn update-s3...`,
  );
  const jitter = randomInt(DEFAULT_JITTER_MS);
  console.log(
    `[Scheduler] [${SCHEDULER_INSTANCE_ID}] [Bookmarks] Applying jitter of ${jitter}ms before update-s3`,
  );
  setTimeout(() => {
    // Check if job is already running
    if (runningJobs.has("bookmarks")) {
      console.warn(
        `[Scheduler] [${SCHEDULER_INSTANCE_ID}] [Bookmarks] Job is already running, skipping this execution`,
      );
      return;
    }
    runningJobs.add("bookmarks");
    console.log(
      `[Scheduler] [${SCHEDULER_INSTANCE_ID}] [Bookmarks] Command: bun run update-s3 -- ${DATA_UPDATER_FLAGS.BOOKMARKS}`,
    );
    console.log(
      `[Scheduler] [${SCHEDULER_INSTANCE_ID}] [Bookmarks] Using S3_BUCKET=${process.env.S3_BUCKET}`,
    );

    const updateProcess = spawn("bun", ["run", "update-s3", "--", DATA_UPDATER_FLAGS.BOOKMARKS], {
      env: process.env,
      stdio: "inherit",
      detached: false,
    });

    updateProcess.on("error", (err) => {
      console.error(
        `[Scheduler] [${SCHEDULER_INSTANCE_ID}] [Bookmarks] Failed to start update-s3 process:`,
        err,
      );
    });

    updateProcess.on("close", (code) => {
      // Remove from running jobs
      runningJobs.delete("bookmarks");

      if (code !== 0) {
        console.error(
          `[Scheduler] [${SCHEDULER_INSTANCE_ID}] [Bookmarks] update-s3 script failed (code ${code}).`,
        );
      } else {
        console.log(
          `[Scheduler] [${SCHEDULER_INSTANCE_ID}] [Bookmarks] update-s3 script completed successfully`,
        );

        // Invalidate Next.js cache to serve fresh data
        console.log("[Scheduler] [Bookmarks] Invalidating Next.js cache for bookmarks...");
        const apiUrl = getBaseUrl();
        const revalidateUrl = new URL("/api/revalidate/bookmarks", apiUrl).toString();

        // Only include auth header if secret is configured
        const headers = process.env.BOOKMARK_CRON_REFRESH_SECRET
          ? { Authorization: `Bearer ${process.env.BOOKMARK_CRON_REFRESH_SECRET}` }
          : undefined;

        // Add timeout using AbortController
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10_000); // 10 second timeout

        fetch(revalidateUrl, {
          method: "POST",
          headers,
          signal: controller.signal,
        })
          .then((response) => {
            clearTimeout(timeoutId);
            if (response.ok) {
              console.log("[Scheduler] [Bookmarks] ✅ Cache invalidated successfully");
            } else {
              console.error(
                `[Scheduler] [Bookmarks] Cache invalidation failed with status ${response.status}`,
              );
            }
            return null;
          })
          .catch((error) => {
            clearTimeout(timeoutId);
            if (error instanceof Error && error.name === "AbortError") {
              console.error(
                "[Scheduler] [Bookmarks] Cache invalidation timed out after 10 seconds",
              );
            } else {
              console.error("[Scheduler] [Bookmarks] Failed to invalidate cache:", error);
            }
          });

        // Submit updated sitemap to search engines
        console.log(
          "[Scheduler] [Bookmarks] Submitting updated sitemap to search engines asynchronously...",
        );
        const sitemapProcess = spawn("bun", ["run", "submit-sitemap"], {
          env: process.env,
          stdio: "inherit",
        });

        sitemapProcess.on("error", (err) => {
          console.error("[Scheduler] [Bookmarks] Failed to start sitemap submission process:", err);
        });

        sitemapProcess.on("close", (code) => {
          if (code !== 0) {
            console.error(`[Scheduler] [Bookmarks] Sitemap submission failed (code ${code}).`);
          } else {
            console.log("[Scheduler] [Bookmarks] Sitemap submitted successfully to search engines");
          }
        });
      }
    });
  }, jitter);
});

console.log(`[Scheduler] GitHub Activity schedule: ${githubCron} (daily at midnight)`);
cron.schedule(githubCron, () => {
  console.log(
    `[Scheduler] [GitHub] Cron triggered at ${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}. Preparing to spawn update-s3...`,
  );
  const jitterGH = randomInt(DEFAULT_JITTER_MS);
  console.log(`[Scheduler] [GitHub] Applying jitter of ${jitterGH}ms before update-s3`);
  setTimeout(() => {
    // Check if job is already running
    if (runningJobs.has("github")) {
      console.warn("[Scheduler] [GitHub] Job is already running, skipping this execution");
      return;
    }
    runningJobs.add("github");
    // CRITICAL: Use --github flag, NOT --github-activity (data-updater expects --github)
    console.log(`[Scheduler] [GitHub] Command: bun run update-s3 -- ${DATA_UPDATER_FLAGS.GITHUB}`);
    console.log(`[Scheduler] [GitHub] Using S3_BUCKET=${process.env.S3_BUCKET}`);

    const updateProcess = spawn("bun", ["run", "update-s3", "--", DATA_UPDATER_FLAGS.GITHUB], {
      env: process.env,
      stdio: "inherit",
      detached: false,
    });

    updateProcess.on("error", (err) => {
      console.error("[Scheduler] [GitHub] Failed to start update-s3 process:", err);
    });

    updateProcess.on("close", (code) => {
      // Remove from running jobs
      runningJobs.delete("github");

      if (code !== 0) {
        console.error(`[Scheduler] [GitHub] update-s3 script failed (code ${code}).`);
      } else {
        console.log("[Scheduler] [GitHub] update-s3 script completed successfully");

        // Invalidate Next.js cache to serve fresh data (mirrors bookmarks pattern)
        console.log("[Scheduler] [GitHub] Invalidating Next.js cache for GitHub activity...");
        const apiUrl = getBaseUrl();
        const revalidateUrl = new URL("/api/revalidate/github-activity", apiUrl).toString();

        // Only include auth header if secret is configured
        const headers = process.env.GITHUB_CRON_REFRESH_SECRET
          ? { Authorization: `Bearer ${process.env.GITHUB_CRON_REFRESH_SECRET}` }
          : process.env.BOOKMARK_CRON_REFRESH_SECRET
            ? { Authorization: `Bearer ${process.env.BOOKMARK_CRON_REFRESH_SECRET}` }
            : undefined;

        // Add timeout using AbortController
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10_000); // 10 second timeout

        fetch(revalidateUrl, {
          method: "POST",
          headers,
          signal: controller.signal,
        })
          .then((response) => {
            clearTimeout(timeoutId);
            if (response.ok) {
              console.log("[Scheduler] [GitHub] ✅ Cache invalidated successfully");
            } else {
              console.error(
                `[Scheduler] [GitHub] Cache invalidation failed with status ${response.status}`,
              );
            }
            return null;
          })
          .catch((error) => {
            clearTimeout(timeoutId);
            if (error instanceof Error && error.name === "AbortError") {
              console.error("[Scheduler] [GitHub] Cache invalidation timed out after 10 seconds");
            } else {
              console.error("[Scheduler] [GitHub] Failed to invalidate cache:", error);
            }
          });
      }
    });
  }, jitterGH);
});

console.log(`[Scheduler] Books schedule: ${booksCron} (daily at 6 AM PT)`);
cron.schedule(booksCron, () => {
  console.log(
    `[Scheduler] [Books] Cron triggered at ${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}. Preparing to spawn update-s3...`,
  );
  const jitterBooks = randomInt(DEFAULT_JITTER_MS);
  console.log(`[Scheduler] [Books] Applying jitter of ${jitterBooks}ms before update-s3`);
  setTimeout(() => {
    if (runningJobs.has("books")) {
      console.warn("[Scheduler] [Books] Job is already running, skipping this execution");
      return;
    }
    runningJobs.add("books");
    console.log(`[Scheduler] [Books] Command: bun run update-s3 -- ${DATA_UPDATER_FLAGS.BOOKS}`);

    const updateProcess = spawn("bun", ["run", "update-s3", "--", DATA_UPDATER_FLAGS.BOOKS], {
      env: process.env,
      stdio: "inherit",
      detached: false,
    });

    updateProcess.on("error", (err) => {
      console.error("[Scheduler] [Books] Failed to start update-s3 process:", err);
    });

    updateProcess.on("close", (code) => {
      runningJobs.delete("books");

      if (code !== 0) {
        console.error(`[Scheduler] [Books] update-s3 script failed (code ${code}).`);
      } else {
        console.log("[Scheduler] [Books] update-s3 script completed successfully");

        // Invalidate Next.js cache to serve fresh book data
        console.log("[Scheduler] [Books] Invalidating Next.js cache for books...");
        const apiUrl = getBaseUrl();
        const revalidateUrl = new URL("/api/revalidate/books", apiUrl).toString();

        const headers = process.env.BOOKMARK_CRON_REFRESH_SECRET
          ? { Authorization: `Bearer ${process.env.BOOKMARK_CRON_REFRESH_SECRET}` }
          : undefined;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10_000);

        fetch(revalidateUrl, {
          method: "POST",
          headers,
          signal: controller.signal,
        })
          .then((response) => {
            clearTimeout(timeoutId);
            if (response.ok) {
              console.log("[Scheduler] [Books] ✅ Cache invalidated successfully");
            } else {
              console.error(
                `[Scheduler] [Books] Cache invalidation failed with status ${response.status}`,
              );
            }
            return null;
          })
          .catch((error) => {
            clearTimeout(timeoutId);
            if (error instanceof Error && error.name === "AbortError") {
              console.error("[Scheduler] [Books] Cache invalidation timed out after 10 seconds");
            } else {
              console.error("[Scheduler] [Books] Failed to invalidate cache:", error);
            }
          });
      }
    });
  }, jitterBooks);
});

console.log(`[Scheduler] Logos schedule: ${logosCron} (weekly Sunday 1 AM)`);
cron.schedule(logosCron, () => {
  console.log(
    `[Scheduler] [Logos] Cron triggered at ${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}. Preparing to spawn update-s3...`,
  );
  const jitterLogo = randomInt(DEFAULT_JITTER_MS);
  console.log(`[Scheduler] [Logos] Applying jitter of ${jitterLogo}ms before update-s3`);
  setTimeout(() => {
    // Check if job is already running
    if (runningJobs.has("logos")) {
      console.warn("[Scheduler] [Logos] Job is already running, skipping this execution");
      return;
    }
    runningJobs.add("logos");
    console.log(`[Scheduler] [Logos] Command: bun run update-s3 -- ${DATA_UPDATER_FLAGS.LOGOS}`);
    console.log(`[Scheduler] [Logos] Using S3_BUCKET=${process.env.S3_BUCKET}`);

    const updateProcess = spawn("bun", ["run", "update-s3", "--", DATA_UPDATER_FLAGS.LOGOS], {
      env: process.env,
      stdio: "inherit",
      detached: false,
    });

    updateProcess.on("error", (err) => {
      console.error("[Scheduler] [Logos] Failed to start update-s3 process:", err);
    });

    updateProcess.on("close", (code) => {
      // Remove from running jobs
      runningJobs.delete("logos");

      if (code !== 0) {
        console.error(`[Scheduler] [Logos] update-s3 script failed (code ${code}).`);
      } else {
        console.log("[Scheduler] [Logos] update-s3 script completed successfully");
      }
    });
  }, jitterLogo);
});

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
