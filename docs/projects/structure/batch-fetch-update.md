<!-- markdownlint-disable MD029 -->

# Batch Fetch Update Architecture

**Functionality:** `batch-fetch-update`

This document outlines the automated background refresh schedule and batch processing architecture for production data in the williamcallahan.com application.

## Overview

The application uses a cron-based scheduler (`scripts/scheduler.ts`) that runs continuously and triggers background data updates at optimized intervals. All scheduling is done in Pacific Time (America/Los_Angeles).

## Architecture Decisions

1. **Async Scheduler**: Uses async `spawn` (not `spawnSync`) with job tracking so jobs run independently without blocking.

2. **Runtime Logo Fetching**: Logos fetched on-demand at runtime with multi-tier caching (not at build time). `bun run build:full` available for complete prefetch if needed.

3. **Centralized Data Fetching**: Single `lib/server/data-fetch-manager.ts` with CLI interface. Entry point: `scripts/data-updater.ts`.

## Open Issues

### 🟠 HIGH Priority

1. **Missing Type Definitions**
   - **Location**: `types/node-cron.d.ts`
   - **Issue**: Custom declaration instead of @types/node-cron
   - **Fix**: `npm install --save-dev @types/node-cron`

2. **Brittle Data Parsing**
   - **Location**: `scripts/prefetch-data.ts`
   - **Issue**: Regex parsing of TypeScript files breaks with formatting changes
   - **Fix**: Refactor data files to export pure data structures

3. **No Concurrency Protection**
   - **Issue**: No protection against overlapping jobs
   - **Impact**: Can cause data corruption or API rate limit issues
   - **Fix**: Implement job locking mechanism

4. **No Retry Mechanism**
   - **Issue**: Failed operations are not retried
   - **Impact**: Transient failures cause permanent data gaps
   - **Fix**: Implement dead letter queue

## Refresh Frequencies

### 📖 Bookmarks: Every 2 Hours (12x/day)

- **Schedule**: `0 */2 * * *` (at minute 0 of every 2nd hour)
- **Frequency**: 12 times per day
- **Rationale**: Bookmarks are actively consumed content that benefits from frequent updates
- **Times**: 12:00 AM, 2:00 AM, 4:00 AM, 6:00 AM, 8:00 AM, 10:00 AM, 12:00 PM, 2:00 PM, 4:00 PM, 6:00 PM, 8:00 PM, 10:00 PM

### 🐙 GitHub Activity: Daily (1x/day)

- **Schedule**: `0 0 * * *` (at midnight)
- **Frequency**: Once per day
- **Rationale**: GitHub contribution data changes daily and doesn't require more frequent updates

### 🎨 Logos: Weekly (1x/week)

- **Schedule**: `0 1 * * 0` (Sunday at 1:00 AM)
- **Frequency**: Once per week
- **Rationale**: Company logos rarely change, weekly refresh reduces API load while maintaining freshness

## Infrastructure Details

### Scheduler Architecture

```typescript
// scripts/scheduler.ts - Uses async spawn
const updateProcess = spawn("bun", ["run", "update-s3", "--", "--bookmarks"], {
  env: process.env,
  stdio: "inherit",
  detached: false,
});
// Jobs run independently without blocking scheduler
```

### Data Fetch Manager Architecture

```typescript
// lib/server/data-fetch-manager.ts
export class DataFetchManager {
  async fetchData(config: DataFetchConfig): Promise<DataFetchResult[]> {
    // Orchestrates all data fetching operations
    // Returns unified results for monitoring
  }

  async prefetchForBuild(): Promise<DataFetchResult[]> {
    // Optimized build-time fetch (S3 only)
  }
}

export class DataFetchManagerCLI {
  static async run(): Promise<void> {
    // Parses command-line arguments
    // Executes appropriate DataFetchManager methods
    // Handles process exit codes
  }
}
```

### Usage Examples

```bash
# Update all data
bun scripts/data-updater.ts

# Update specific data types
bun scripts/data-updater.ts --bookmarks
bun scripts/data-updater.ts --github --logos

# Prefetch for builds
bun scripts/data-updater.ts --prefetch-build  # Fast (S3 only)
bun scripts/data-updater.ts --prefetch-dev    # Full (all sources)

# Force refresh
bun scripts/data-updater.ts --force --bookmarks
```

**Key Components:**

### Core Orchestrator

- **lib/server/data-fetch-manager.ts**: Centralized data fetching orchestrator
  - Handles bookmarks, GitHub activity, and logo fetching
  - Provides unified interface for all data operations
  - Manages batch processing, rate limiting, and retries

### Script Layer

- **lib/server/scheduler.ts**: Long-running process using node-cron
- **scripts/data-updater.ts**: Unified CLI for all data operations
  - `--bookmarks`: Update bookmarks only
  - `--github`: Update GitHub activity only
  - `--logos`: Update logos only
  - `--prefetch-build`: Fast build prefetch (S3 only)
  - `--prefetch-dev`: Full development prefetch
  - `--force`: Force refresh regardless of cache
- **scripts/force-refresh-repo-stats.ts**: Manual GitHub stats refresh
- **scripts/refresh-opengraph-images.ts**: OpenGraph image backfilling

### Build-Time vs Runtime Data Strategy

**Build-Time Prefetch (via `prefetch-data-optimized.ts`):**

- ✅ Bookmarks JSON from S3
- ✅ GitHub activity data from S3
- ❌ Logos (skipped for faster builds)

**Runtime Fetching (streaming uploads):**

- Logos fetched on-demand when first requested
- Multi-tier data access ensures good performance:
  - Memory cache: ~1ms (ServerCacheInstance)
  - S3 storage: ~10-50ms (persistent)
  - External API: 100ms-5s (only on storage miss)
  - **New:** logo downloads are now streamed directly from the source URL to S3. Memory footprint per logo is constant (~65 KB) because we no longer buffer the entire image in RAM before upload.

**Background Updates (via scheduler):**

- Bookmarks: Every 2 hours
- GitHub: Daily at midnight
- Logos: Weekly on Sundays (keeps S3 storage populated)

### Environment Configuration

All schedules can be overridden via environment variables:

```bash
# Bookmarks (default: every 2 hours)
S3_BOOKMARKS_CRON="0 */2 * * *"

# GitHub Activity (default: daily at midnight)
S3_GITHUB_CRON="0 0 * * *"

# Logos (default: weekly Sunday at 1 AM)
S3_LOGOS_CRON="0 1 * * 0"
```

### Staggered Execution

The schedules are deliberately staggered to prevent resource contention:

- **Bookmarks**: Every 2 hours at minute 0
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

- No dedicated refresh endpoint (handled via update-s3 script)
- Uses existing logo fetching infrastructure with S3 caching

## Monitoring & Logging

### Scheduler Logs

```bash
[Scheduler] Process started. Setting up cron jobs...
[Scheduler] Bookmarks schedule: 0 */2 * * * (every 2 hours)
[Scheduler] GitHub Activity schedule: 0 0 * * * (daily at midnight)
[Scheduler] Logos schedule: 0 1 * * 0 (weekly Sunday 1 AM)
[Scheduler] Setup complete. Scheduler is running...
[Scheduler] Production frequencies: Bookmarks (12x/day), GitHub (1x/day), Logos (1x/week)
```

### Execution Logs

```bash
[Scheduler] [Bookmarks] Cron triggered at <timestamp>. Spawning update-s3...
[Scheduler] [Bookmarks] update-s3 script completed successfully
```

### Error Handling Issues

**Current State:**

- Failed script executions are logged but not retried
- Scheduler can be blocked by hanging jobs
- No circuit breaker for external API failures
- Missing dead letter queue for failed operations

**Recommended Improvements:**

1. **Implement Job Queue with State Management**

```typescript
interface JobState {
  id: string;
  type: "bookmarks" | "github" | "logos";
  status: "pending" | "running" | "completed" | "failed";
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  retryCount: number;
}
```

2. **Add Circuit Breaker Pattern**

```typescript
class CircuitBreaker {
  private failureCount = 0;
  private state: "closed" | "open" | "half-open" = "closed";

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      throw new Error("Circuit breaker is open");
    }
    // Implementation...
  }
}
```

3. **Implement Job Locking**

**⚠️ WARNING: The following example is for educational purposes only and demonstrates the concept. It is NOT safe for production multi-instance deployments due to race conditions (TOCTOU) and local filesystem dependencies.**

```typescript
// EDUCATIONAL EXAMPLE - Single Instance Only
const createLock = (jobName: string): boolean => {
  const lockFile = `/tmp/locks/${jobName}.lock`;
  if (existsSync(lockFile)) {
    console.warn(`Job ${jobName} is already running`);
    return false;
  }
  writeFileSync(lockFile, String(process.pid));
  return true;
};
```

**For production deployments**, use distributed locking mechanisms:

```typescript
// PRODUCTION EXAMPLE - Multi-Instance Safe
import Redis from "ioredis";
import Redlock from "redlock";

const redis = new Redis();
const redlock = new Redlock([redis]);

async function createDistributedLock(jobName: string): Promise<Lock | null> {
  try {
    // Lock for 5 minutes (300,000ms)
    const lock = await redlock.acquire([`locks:${jobName}`], 300000);
    return lock;
  } catch (error) {
    console.warn(`Job ${jobName} is already running on another instance`);
    return null;
  }
}

// Usage with automatic unlock on completion
async function runJobWithLock(jobName: string, job: () => Promise<void>) {
  const lock = await createDistributedLock(jobName);
  if (!lock) return;

  try {
    await job();
  } finally {
    await lock.release();
  }
}
```

See the [Scaling Considerations](#scaling-considerations) section for more distributed system patterns.

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

# Logos (via update-s3 script)
bun run update-s3 -- --logos
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

1. **In-Memory Cache**: Fast access for active requests
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
bun run scheduler:dev
```

### Health Checks

The scheduler process must remain running for automated updates. Monitor via:

- Process health (scheduler.ts running)
- Log output for successful cron triggers
- Data freshness in cache/S3

### Architectural Improvements Needed

1. **Replace Blocking Architecture**

```typescript
// WRONG: Current blocking approach
const result = spawnSync("bun", ["run", "update-s3"]);

// RIGHT: Non-blocking async approach
const updateProcess = spawn("bun", ["run", "update-s3"], {
  env: process.env,
  stdio: "inherit",
  detached: false,
});

updateProcess.on("close", code => {
  if (code !== 0) {
    console.error(`Update failed with code ${code}`);
    // Add to dead letter queue
  }
});
```

2. **Implement Incremental Updates**

```typescript
interface SyncState {
  lastSyncAt: Date;
  lastSuccessfulSyncAt: Date;
  totalItemsSynced: number;
}

async function incrementalBookmarkSync(): Promise<void> {
  const syncState = await getSyncState("bookmarks");
  const newBookmarks = await fetchBookmarksSince(syncState.lastSuccessfulSyncAt);
  // Process only new/updated items
}
```

3. **Add Monitoring & Metrics**

```typescript
interface JobMetrics {
  jobType: string;
  duration: number;
  itemsProcessed: number;
  errors: number;
  timestamp: Date;
}
```

### Scaling Considerations

- Current implementation is single-instance and vulnerable to blocking
- For production deployments:
  - Use proper job queue (e.g., BullMQ, Agenda)
  - Implement distributed locking (Redis/DynamoDB)
  - Add health checks and monitoring
  - Consider serverless scheduled functions

## Troubleshooting

### Common Issues

1. **Scheduler not running**: Check if `scripts/scheduler.ts` process is alive
2. **Authentication failures**: Verify environment secrets are set
3. **External API failures**: Check rate limits and API availability
4. **S3 connection issues**: Verify AWS credentials and bucket access

### Debug Commands

```bash
# Check current cache status
curl http://localhost:3000/api/bookmarks/refresh

# Manual trigger for testing
bun run update-s3 -- --bookmarks --verbose

# View scheduler logs
tail -f /path/to/scheduler.log
```

This production schedule ensures fresh content while optimizing API usage and resource consumption.
