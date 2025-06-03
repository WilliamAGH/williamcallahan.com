# Production Data Refresh Schedule

This document outlines the automated background refresh schedule for production data in the williamcallahan.com application.

## Overview

The application uses a sophisticated cron-based scheduler (`scripts/scheduler.ts`) that runs continuously and triggers background data updates at optimized intervals. All scheduling is done in Pacific Time (America/Los_Angeles).

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
// scripts/scheduler.ts
- Continuous long-running process
- Uses node-cron for scheduling
- Spawns update-s3 script with specific flags
- Remains alive indefinitely for scheduled updates
```

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
[Scheduler] [Bookmarks] Cron triggered at 2/15/2024, 2:00:00 AM. Spawning update-s3...
[Scheduler] [Bookmarks] update-s3 script completed successfully
```

### Error Handling
- Failed script executions are logged with exit codes
- Scheduler continues running after individual task failures
- Each data type has independent error handling

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

### Scaling Considerations
- Current implementation is single-instance
- For multi-instance deployments, consider:
  - External cron service (e.g., GitHub Actions, cloud schedulers)
  - Distributed task queue
  - Leader election for cron tasks

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