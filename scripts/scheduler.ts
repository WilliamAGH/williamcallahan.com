// Continuous Background Scheduler
//
// This is a long-running process that schedules and triggers data update tasks
// at specified intervals:
// - Bookmarks: Every 2 hours (refreshes external bookmarks data)
// - GitHub Activity: Daily at midnight PT (refreshes GitHub contribution data)
// - Logos: Daily at midnight PT (refreshes company logos)
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
//   - S3_LOGOS_CRON (default: daily at midnight)
// - All times are in Pacific Time (America/Los_Angeles)
//
// Note: This process must stay running for scheduled updates to occur.

import rawCron from 'node-cron';
import { spawnSync } from 'child_process';

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

// The scheduler process remains alive indefinitely, waiting for cron events.
// DO NOT EXIT this process - it must stay running for scheduled updates to occur.
console.log('[Scheduler] Setup complete. Scheduler is running and waiting for scheduled trigger times...');