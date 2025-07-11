// Load environment variables first
import { loadEnvironmentWithMultilineSupport } from "@/lib/utils/env-loader";
loadEnvironmentWithMultilineSupport();

// Continuous Background Scheduler
//
// This is a long-running process that schedules and triggers data update tasks
// at specified intervals:
// - Bookmarks: Every 2 hours (refreshes external bookmarks data)
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
//   - S3_GITHUB_CRON (default: daily at midnight)
//   - S3_LOGOS_CRON (default: weekly on Sunday at 1 AM)
// - All times are in Pacific Time (America/Los_Angeles)
//
// Production Refresh Frequencies:
// - Bookmarks: 12 times/day (every 2 hours) - optimal for content freshness
// - GitHub Activity: 1 time/day (midnight) - sufficient for contribution data
// - Logos: 1 time/week (Sunday 1 AM) - logos rarely change, reduces API load
//
// Note: This process must stay running for scheduled updates to occur.

import { randomInt } from "node:crypto";
import rawCron from "node-cron";
// Maximum random jitter for scheduled tasks: 15 minutes
const DEFAULT_JITTER_MS = 15 * 60 * 1000;
import { spawn } from "node:child_process";

// Track running jobs to prevent concurrent executions
const runningJobs = new Set<string>();

console.log("[Scheduler] Process started. Setting up cron jobs...");
// Debug: log key environment variables
console.log(
  `[Scheduler] Env vars: S3_BUCKET=${process.env.S3_BUCKET}, ` +
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
const githubCron = process.env.S3_GITHUB_CRON || "0 0 * * *"; // daily at midnight (1x/day)
const logosCron = process.env.S3_LOGOS_CRON || "0 1 * * 0"; // weekly Sunday at 1 AM (1x/week)

console.log(`[Scheduler] Bookmarks schedule: ${bookmarksCron} (every 2 hours)`);
cron.schedule(bookmarksCron, () => {
  console.log(
    `[Scheduler] [Bookmarks] Cron triggered at ${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}. Preparing to spawn update-s3...`,
  );
  const jitter = randomInt(DEFAULT_JITTER_MS);
  console.log(`[Scheduler] [Bookmarks] Applying jitter of ${jitter}ms before update-s3`);
  setTimeout(() => {
    // Check if job is already running
    if (runningJobs.has("bookmarks")) {
      console.warn("[Scheduler] [Bookmarks] Job is already running, skipping this execution");
      return;
    }
    runningJobs.add("bookmarks");
    console.log("[Scheduler] [Bookmarks] Command: bun run update-s3 -- --bookmarks");
    console.log(`[Scheduler] [Bookmarks] Using S3_BUCKET=${process.env.S3_BUCKET}`);

    const updateProcess = spawn("bun", ["run", "update-s3", "--", "--bookmarks"], {
      env: process.env,
      stdio: "inherit",
      detached: false,
    });

    updateProcess.on("error", (err) => {
      console.error("[Scheduler] [Bookmarks] Failed to start update-s3 process:", err);
    });

    updateProcess.on("close", (code) => {
      // Remove from running jobs
      runningJobs.delete("bookmarks");

      if (code !== 0) {
        console.error(`[Scheduler] [Bookmarks] update-s3 script failed (code ${code}).`);
      } else {
        console.log("[Scheduler] [Bookmarks] update-s3 script completed successfully");

        // Submit updated sitemap to search engines
        console.log("[Scheduler] [Bookmarks] Submitting updated sitemap to search engines asynchronously...");
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
    console.log("[Scheduler] [GitHub] Command: bun run update-s3 -- --github-activity");
    console.log(`[Scheduler] [GitHub] Using S3_BUCKET=${process.env.S3_BUCKET}`);

    const updateProcess = spawn("bun", ["run", "update-s3", "--", "--github-activity"], {
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
      }
    });
  }, jitterGH);
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
    console.log("[Scheduler] [Logos] Command: bun run update-s3 -- --logos");
    console.log(`[Scheduler] [Logos] Using S3_BUCKET=${process.env.S3_BUCKET}`);

    const updateProcess = spawn("bun", ["run", "update-s3", "--", "--logos"], {
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
console.log("[Scheduler] Setup complete. Scheduler is running and waiting for scheduled trigger times...");
console.log("[Scheduler] Production frequencies: Bookmarks (12x/day), GitHub (1x/day), Logos (1x/week)");
