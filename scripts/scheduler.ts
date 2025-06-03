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

import rawCron from 'node-cron';
import { spawnSync } from 'node:child_process';

console.log('[Scheduler] Process started. Setting up cron jobs...');

// Ensure Node Cron interprets times in PT
process.env.TZ = 'America/Los_Angeles';
console.log('[Scheduler] Starting update-s3-data scheduler (PT)...');
// Typed wrapper around node-cron to avoid any-typed calls
const cron = rawCron as { schedule: (expression: string, task: () => void) => void };

// Cron expressions (minute hour day month weekday)
// Staggered timing to prevent resource contention
const bookmarksCron = process.env.S3_BOOKMARKS_CRON || '0 */2 * * *';    // every 2h at minute 0 (12x/day)
const githubCron    = process.env.S3_GITHUB_CRON    || '0 0 * * *';     // daily at midnight (1x/day)
const logosCron     = process.env.S3_LOGOS_CRON     || '0 1 * * 0';     // weekly Sunday at 1 AM (1x/week)

console.log(`[Scheduler] Bookmarks schedule: ${bookmarksCron} (every 2 hours)`);
cron.schedule(bookmarksCron, () => {
  console.log(`[Scheduler] [Bookmarks] Cron triggered at ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}. Spawning update-s3...`);
  const result = spawnSync('bun', ['run', 'update-s3', '--', '--bookmarks'], { env: process.env, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`[Scheduler] [Bookmarks] update-s3 script failed (code ${result.status}). Error: ${result.error}`);
  } else {
    console.log('[Scheduler] [Bookmarks] update-s3 script completed successfully');

    // Submit updated sitemap to search engines
    console.log('[Scheduler] [Bookmarks] Submitting updated sitemap to search engines...');
    const sitemapResult = spawnSync('bun', ['run', 'submit-sitemap'], { env: process.env, stdio: 'inherit' });
    if (sitemapResult.status !== 0) {
      console.error(`[Scheduler] [Bookmarks] Sitemap submission failed (code ${sitemapResult.status}). Error: ${sitemapResult.error}`);
    } else {
      console.log('[Scheduler] [Bookmarks] Sitemap submitted successfully to search engines');
    }
  }
});

console.log(`[Scheduler] GitHub Activity schedule: ${githubCron} (daily at midnight)`);
cron.schedule(githubCron, () => {
  console.log(`[Scheduler] [GitHub] Cron triggered at ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}. Spawning update-s3...`);
  const result = spawnSync('bun', ['run', 'update-s3', '--', '--github-activity'], { env: process.env, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`[Scheduler] [GitHub] update-s3 script failed (code ${result.status}). Error: ${result.error}`);
  } else {
    console.log('[Scheduler] [GitHub] update-s3 script completed successfully');
  }
});

console.log(`[Scheduler] Logos schedule: ${logosCron} (weekly Sunday 1 AM)`);
cron.schedule(logosCron, () => {
  console.log(`[Scheduler] [Logos] Cron triggered at ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}. Spawning update-s3...`);
  const result = spawnSync('bun', ['run', 'update-s3', '--', '--logos'], { env: process.env, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`[Scheduler] [Logos] update-s3 script failed (code ${result.status}). Error: ${result.error}`);
  } else {
    console.log('[Scheduler] [Logos] update-s3 script completed successfully');
  }
});

// The scheduler process remains alive indefinitely, waiting for cron events.
// DO NOT EXIT this process - it must stay running for scheduled updates to occur.
console.log('[Scheduler] Setup complete. Scheduler is running and waiting for scheduled trigger times...');
console.log('[Scheduler] Production frequencies: Bookmarks (12x/day), GitHub (1x/day), Logos (1x/week)');