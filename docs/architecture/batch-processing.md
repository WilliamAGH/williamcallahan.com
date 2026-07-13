<!-- markdownlint-disable MD029 -->

# Batch Fetch Update Architecture

**Functionality:** `batch-fetch-update`

This document outlines the automated background refresh schedule and batch processing architecture for production data in the williamcallahan.com application.

## Overview

The application uses a cron-based scheduler (`scheduler/scheduler.ts`) that runs continuously and triggers background data updates at optimized intervals. All scheduling is done in Pacific Time (America/Los_Angeles).

## Architecture Decisions

1. **Startup Bootstrap**: After the database readiness gate, `scheduler/entrypoint.sh` runs
   `node --run update-data` with no operation flags. That invokes the canonical default
   data-updater operation set, including books and search indexes. After success, the
   scheduler invalidates the bookmark, books, and GitHub web caches through their existing
   authenticated endpoints. Any bootstrap or cache-revalidation failure stops the container
   before cron starts.

2. **Async Scheduler**: Uses async `spawn` (not `spawnSync`) with job tracking so recurring
   jobs run independently without blocking.

3. **Scheduled Asset Refresh**: The scheduler refreshes logos through `scheduler/data-updater.ts`; `bun run prefetch` performs a one-shot refresh of bookmarks, GitHub activity, and logos.

4. **Centralized Data Fetching**: `src/lib/server/data-fetch-manager.ts` is the single orchestrator. Its CLI entry point is `scheduler/data-updater.ts`.

## Refresh Frequencies

### Bookmarks: Every 2 Hours (12x/day)

- **Schedule**: `0 */2 * * *` (at minute 0 of every 2nd hour)
- **Frequency**: 12 times per day
- **Rationale**: Bookmarks are actively consumed content that benefits from frequent updates
- **Times**: 12:00 AM, 2:00 AM, 4:00 AM, 6:00 AM, 8:00 AM, 10:00 AM, 12:00 PM, 2:00 PM, 4:00 PM, 6:00 PM, 8:00 PM, 10:00 PM

### Bookmark Tags: Every 4 Hours (6x/day)

- **Schedule**: `30 */4 * * *` (at minute 30 every fourth hour)
- **Frequency**: 6 times per day
- **Rationale**: Keeps canonical tag aliases current without competing with bookmark refreshes.

### Bookmark Tag Retrofit: Daily (1x/day)

- **Schedule**: `45 3 * * *` (at 3:45 AM)
- **Frequency**: Once per day
- **Rationale**: Revisits bookmarks that still need tag-alias review.

### Books: Daily (1x/day)

- **Schedule**: `0 6 * * *` (at 6:00 AM)
- **Frequency**: Once per day
- **Rationale**: Regenerates the consolidated books dataset from AudioBookShelf.

### GitHub Activity: Daily (1x/day)

- **Schedule**: `0 0 * * *` (at midnight)
- **Frequency**: Once per day
- **Rationale**: GitHub contribution data changes daily and doesn't require more frequent updates

### Logos: Weekly (1x/week)

- **Schedule**: `0 1 * * 0` (Sunday at 1:00 AM)
- **Frequency**: Once per week
- **Rationale**: Company logos rarely change, weekly refresh reduces API load while maintaining freshness

## Infrastructure Details

### Scheduler Architecture

`scheduler/scheduler.ts` spawns `node --run update-data -- <flag>` asynchronously for each job. It uses the canonical `DATA_UPDATER_FLAGS` inventory and a per-job lock to keep matching jobs from overlapping.

### Data Fetch Manager Architecture

`scheduler/data-updater.ts` parses CLI flags, invokes `DataFetchManager`, and exits nonzero when a requested operation fails.
Its no-flag default is the scheduler bootstrap contract; the operation inventory remains owned by
the data updater rather than the entrypoint.
GitHub activity refreshes resolve PostgreSQL write eligibility before external API work. Read-only
deployments return a successful zero-item summary, while unexpected production failures remain
error results and are reported to Sentry.

### Usage Examples

```bash
# Update all data
bun run update-data

# Update specific data types
bun run update-data -- --bookmarks
bun run update-data -- --github --logos

# One-shot refresh
bun run prefetch

# Force refresh
bun run update-data -- --force --bookmarks
```

**Key Components:**

### Core Orchestrator

- **src/lib/server/data-fetch-manager.ts**: Centralized data fetching orchestrator
  - Delegates GitHub activity to `src/lib/server/github-activity-refresh.ts`
  - Provides unified interface for all data operations
  - Manages batch processing, rate limiting, and retries
- **src/lib/server/github-activity-refresh.ts**: Production-write-gated GitHub refresh operation

### Script Layer

- **scheduler/scheduler.ts**: Long-running process using node-cron
- **scheduler/data-updater.ts**: Unified CLI for all data operations; the flag inventory lives in `src/lib/constants/cli-flags.ts`
- **scripts/force-refresh-repo-stats.ts**: Manual GitHub stats refresh
- **scripts/refresh-opengraph-images.ts**: OpenGraph image backfilling

### Manual and Scheduled Refreshes

`bun run prefetch` runs a one-shot refresh for bookmarks, GitHub activity, and logos. During a Next.js production build, `scheduler/data-updater.ts` refuses writes unless explicitly passed `--allow-build-writes`; recurring updates belong to the scheduler or an explicit manual command.

At scheduler-container startup, the entrypoint runs the no-flag data updater through Node.js before
sitemap submission and cron registration. It logs a successful bootstrap or exits nonzero with an
error; it does not launch a polling background process.

**Background Updates (via scheduler):**

- Bookmarks: Every 2 hours
- Bookmark Tags: Every 4 hours
- Bookmark Tag Retrofit: Daily at 3:45 AM
- Books: Daily at 6 AM
- GitHub: Daily at midnight
- Logos: Weekly on Sundays (keeps S3 storage populated)

### Environment Configuration

All schedules can be overridden via environment variables:

```bash
# Bookmarks (default: every 2 hours)
S3_BOOKMARKS_CRON="0 */2 * * *"

# Bookmark tags (default: every 4 hours at minute 30)
S3_BOOKMARK_TAGS_CRON="30 */4 * * *"

# Bookmark tag retrofit (default: daily at 3:45 AM)
S3_BOOKMARK_TAGS_RETROFIT_CRON="45 3 * * *"

# Books (default: daily at 6 AM)
S3_BOOKS_CRON="0 6 * * *"

# GitHub Activity (default: daily at midnight)
S3_GITHUB_CRON="0 0 * * *"

# Logos (default: weekly Sunday at 1 AM)
S3_LOGOS_CRON="0 1 * * 0"
```

### Environment Detection

The system detects the environment in this order:

1. `DEPLOYMENT_ENV` env var
2. URL detection (`API_BASE_URL` / `NEXT_PUBLIC_SITE_URL`)
3. `NODE_ENV`

### Staggered Execution

The schedules are deliberately staggered to prevent resource contention:

- **Bookmarks**: Every 2 hours at minute 0
- **Bookmark Tags**: Every 4 hours at minute 30
- **Bookmark Tag Retrofit**: Daily at 3:45 AM
- **Books**: Daily at 6:00 AM
- **GitHub**: Daily at midnight (00:00)
- **Logos**: Weekly Sunday at 1 AM (01:00)

## Authentication & Security

### Bookmarks

- Uses `BOOKMARK_CRON_REFRESH_SECRET` for authentication
- Supports both cron jobs (authenticated) and public API calls (rate-limited)
- Cron jobs bypass rate limiting and force refresh

### GitHub Activity

- Uses `GITHUB_REFRESH_SECRET` for authentication
- Protected endpoint requires valid secret header

### Logos

- No dedicated refresh endpoint (handled via update-data script)
- Uses existing logo fetching infrastructure with S3 caching

## Monitoring & Logging

### Scheduler Logs

```bash
[Entrypoint] Running initial data bootstrap...
[Entrypoint] Initial data bootstrap completed
[Scheduler] Starting at <timestamp> with Node <version> in <working-directory>
[Scheduler] Bookmarks schedule: 0 */2 * * *
[Scheduler] BookmarkTags schedule: 30 */4 * * *
[Scheduler] BookmarkTagsRetrofit schedule: 45 3 * * *
[Scheduler] Books schedule: 0 6 * * *
[Scheduler] GitHub schedule: 0 0 * * *
[Scheduler] Logos schedule: 0 1 * * 0
[Scheduler] Setup complete. Scheduler is running and waiting for scheduled trigger times...
[Scheduler] Initial heartbeat: Process <instance-id> is running
```

### Execution Logs

```bash
[Scheduler] [<instance-id>] [Bookmarks] Triggered at <timestamp>
[Scheduler] [<instance-id>] [Bookmarks] Spawning: node --run update-data -- --bookmarks
[Scheduler] [<instance-id>] [Bookmarks] Script completed
```

## API Endpoints

### Manual Refresh Endpoints

For manual triggering or debugging:

```bash
# Bookmarks refresh
curl -X POST http://localhost:3000/api/bookmarks/refresh \
  -H "Authorization: Bearer $BOOKMARK_CRON_REFRESH_SECRET"

# GitHub activity refresh
curl -X POST http://localhost:3000/api/github-activity/refresh \
  -H "x-refresh-secret: $GITHUB_REFRESH_SECRET"

# Logos (via update-data script)
bun run update-data -- --logos
```

### Status Check Endpoints

```bash
# Check bookmark cache status
curl http://localhost:3000/api/bookmarks/refresh

# No dedicated status endpoints for GitHub/Logos currently
```

## Performance Considerations

### Resource Usage

- **Bookmarks**: Moderate API load (12 calls/day to external services)
- **GitHub**: Low API load (1 call/day to GitHub GraphQL API)
- **Logos**: Very low API load (1 batch/week to logo providers)

### Caching Strategy

1. **Next.js Cache Components**: Fast access for active page/render flows
2. **S3 Storage**: Persistent storage between deployments
3. **External APIs**: Fallback when cache/S3 data is unavailable

### Rate Limiting

- Logo fetching includes configurable batch processing
- Built-in delays between batches to respect provider limits
- Environment configurable via `LOGO_BATCH_SIZE` and `LOGO_BATCH_DELAY_MS`

## Deployment & Operations

### Starting the Scheduler

```bash
# Production deployment
bun run scheduler

# Development
NODE_ENV=development bun run scheduler
```

### Health Checks

The scheduler process must remain running for automated updates. Docker allows a 15-minute
startup grace for the database gate, bootstrap, cache revalidation, and sitemap submission.
After cron starts, the scheduler writes an event-loop heartbeat every 30 seconds; its health
check fails when that heartbeat is more than two minutes old. Monitor via:

- Container health and stdout/stderr
- Log output for successful cron triggers
- Data freshness in cache/S3

## Troubleshooting

### Common Issues

1. **Scheduler not running**: Check container health and startup output
2. **Authentication failures**: Verify environment secrets are set
3. **External API failures**: Check rate limits and API availability
4. **S3 connection issues**: Verify AWS credentials and bucket access

### Debug Commands

```bash
# Check current cache status
curl http://localhost:3000/api/bookmarks/refresh

# Manual trigger for testing
bun run update-data -- --bookmarks --verbose

# Inspect the scheduler from its container
scheduler/diagnose-scheduler.sh
```

This production schedule ensures fresh content while optimizing API usage and resource consumption.
