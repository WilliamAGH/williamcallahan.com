/**
 * @fileoverview
 * This file is the entry point for the cron scheduler
 * It schedules the update-s3-data script to run at a specified interval
 * The cron expression can be overridden via the S3_CRON_EXPRESSION environment variable
 * This can be run on a serverless function or a cron job, and is used to update the S3 data bucket
 * with the latest data from the source APIs
 * Any can easily be expanded to run other scripts at other intervals as well
 */

import rawCron from 'node-cron';
import { spawnSync } from 'child_process';

/**
 * Scheduler Script
 * Schedules selective S3 data updates on separate intervals using cron
 * - Bookmarks: every 2 hours
 * - GitHub Activity: every 24 hours
 * - Logos: every 24 hours
 * Times are in Pacific Time (PT)
 * Override each schedule via env vars:
 *   S3_BOOKMARKS_CRON, S3_GITHUB_CRON, S3_LOGOS_CRON
 */
// Ensure Node Cron interprets times in PT
process.env.TZ = 'America/Los_Angeles';
console.log('[Scheduler] Starting update-s3-data scheduler (PT)...');
// Typed wrapper around node-cron to avoid any-typed calls
const cron = rawCron as { schedule: (expression: string, task: () => void) => void };

// Cron expressions (minute hour day month weekday)
const bookmarksCron = process.env.S3_BOOKMARKS_CRON || '0 */2 * * *';    // every 2h at minute 0
const githubCron    = process.env.S3_GITHUB_CRON    || '0 0 * * *';     // daily at midnight
const logosCron     = process.env.S3_LOGOS_CRON     || '0 0 * * *';     // daily at midnight

console.log(`[Scheduler] Bookmarks schedule: ${bookmarksCron}`);
cron.schedule(bookmarksCron, () => {
  console.log(`[Scheduler] [Bookmarks] Triggering at ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}`);
  const result = spawnSync('bun', ['run', 'update-s3', '--', '--bookmarks'], { env: process.env, stdio: 'inherit' });
  if (result.status !== 0) console.error(`[Scheduler] [Bookmarks] Failed (code ${result.status})`);
  else console.log('[Scheduler] [Bookmarks] Completed successfully');
});

console.log(`[Scheduler] GitHub Activity schedule: ${githubCron}`);
cron.schedule(githubCron, () => {
  console.log(`[Scheduler] [GitHub] Triggering at ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}`);
  const result = spawnSync('bun', ['run', 'update-s3', '--', '--github-activity'], { env: process.env, stdio: 'inherit' });
  if (result.status !== 0) console.error(`[Scheduler] [GitHub] Failed (code ${result.status})`);
  else console.log('[Scheduler] [GitHub] Completed successfully');
});

console.log(`[Scheduler] Logos schedule: ${logosCron}`);
cron.schedule(logosCron, () => {
  console.log(`[Scheduler] [Logos] Triggering at ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}`);
  const result = spawnSync('bun', ['run', 'update-s3', '--', '--logos'], { env: process.env, stdio: 'inherit' });
  if (result.status !== 0) console.error(`[Scheduler] [Logos] Failed (code ${result.status})`);
  else console.log('[Scheduler] [Logos] Completed successfully');
});

// Scheduler remains alive listening for cron events