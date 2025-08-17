# Automatic Data Population for Deployments

## Overview

This document describes how bookmark data is automatically populated during deployments to both dev and production environments, ensuring zero downtime and immediate availability of all features.

## Key Components

### 1. Environment Detection (`lib/config/environment.ts`)

- Detects environment from `API_BASE_URL` or `NEXT_PUBLIC_SITE_URL`
- `localhost` → development
- `dev.williamcallahan.com` → development  
- `williamcallahan.com` → production
- Falls back to NODE_ENV if URLs not available

### 2. Docker Entrypoint (`scripts/entrypoint.sh`)

- Checks if slug mapping exists on container startup
- If missing, runs immediate data population via `data-updater.ts`
- Falls back to `ensure-slug-mappings.ts` if data updater fails
- Starts scheduler for ongoing updates
- Handles graceful shutdown

### 3. Scheduler (`lib/server/scheduler.ts`)

- Runs automatically inside container
- Bookmarks: Every 2 hours (12x/day)
- GitHub Activity: Daily at midnight (1x/day)
- Logos: Weekly on Sunday (1x/week)
- All times in Pacific Time

### 4. Build Hooks (`package.json`)

- `postbuild`: Runs after Next.js build to ensure slug mappings exist
- `postdeploy`: Runs post-deployment initialization
- `postinstall`: Initializes CSP hashes

## Deployment Flow

### Docker Build (via Coolify)

1. Build Next.js application
2. Copy scripts and dependencies to container
3. Set up entrypoint script

### Container Startup

1. **Entrypoint executes** (`scripts/entrypoint.sh`)
   - Creates cache directories
   - Checks for existing data in S3
   - If missing: Runs immediate data population
   - Starts scheduler in background
   - Starts Next.js server

2. **Initial Data Population**
   ```bash
   # Automatic check on startup
   if ! bun scripts/debug-slug-mapping.ts | grep -q "Slug mapping exists"; then
       bun scripts/data-updater.ts --bookmarks --force
   fi
   ```

3. **Scheduler Starts**
   - Begins periodic updates based on cron schedules
   - Runs independently of main application

### Ongoing Updates

- Scheduler runs every 2 hours for bookmarks
- Data persists to S3 with environment-specific paths
- Fallback mechanism tries multiple paths for compatibility

## Environment-Specific Behavior

### Development (`dev.williamcallahan.com`)

- S3 paths use `-dev` suffix
- Example: `json/bookmarks/slug-mapping-dev.json`
- Scheduler runs same frequency as production

### Production (`williamcallahan.com`)

- S3 paths use no suffix
- Example: `json/bookmarks/slug-mapping.json`
- Same scheduler frequencies

### Local Development

- Uses `-dev` suffix
- Can run `bun run dev:with-data` for initial population
- Manual updates via `bun run update-s3`

## Redundancy & Fallbacks

### Multiple Save Paths

The system saves to all environment paths for redundancy:
```typescript
await saveSlugMapping(bookmarks, true, true); // Save to all paths
```

### Fallback Loading

When loading slug mappings, tries multiple paths:

1. Primary path (environment-specific)
2. All environment variations
3. Dynamic generation if all fail

### Error Recovery

1. Data updater fails → Falls back to ensure-slug-mappings
2. Slug mapping missing → Regenerates from bookmarks
3. S3 unavailable → Uses cached data if available

## Manual Intervention

### Force Data Update

```bash
# Inside container
bun scripts/data-updater.ts --bookmarks --force

# From host (via docker exec)
docker exec <container-id> bun scripts/data-updater.ts --bookmarks --force
```

### Check Data Status

```bash
# Debug slug mapping
bun scripts/debug-slug-mapping.ts

# Check S3 files
bun scripts/fix-s3-env-suffix.ts
```

### Coolify Post-Deploy Command

No post-deploy command is required. The container's `scripts/entrypoint.sh` performs initial data checks, populates missing data, submits the sitemap once on startup, and starts the scheduler for ongoing updates.

## Monitoring

### Health Checks

- Docker healthcheck every 10s
- Checks `/api/health` endpoint
- Scheduler logs to container stdout

### Verification Commands

```bash
# Check if scheduler is running
ps aux | grep scheduler

# View scheduler logs
docker logs <container-id> | grep Scheduler

# Check S3 data freshness
bun scripts/debug-slug-mapping.ts
```

## What Could Go Wrong?

### Issue: 404 on Bookmark Pages After Deployment

**Cause**: Data not populated yet
**Fix**: Automatic - entrypoint.sh handles this
**Manual Fix**: `bun scripts/ensure-slug-mappings.ts --force --all-paths`

### Issue: Scheduler Not Running

**Cause**: Process crashed or wasn't started
**Fix**: Restart container (scheduler starts automatically)
**Manual Fix**: `bun run scheduler &`

### Issue: Wrong Environment Detected

**Cause**: Missing or incorrect URL env variables
**Fix**: Ensure `API_BASE_URL` or `NEXT_PUBLIC_SITE_URL` is set correctly

### Issue: S3 Connection Failed

**Cause**: Missing credentials or network issue
**Fix**: Check S3_* environment variables
**Required**:

- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_ENDPOINT` (if not AWS)
- `S3_REGION`

## Summary

The system now automatically:

1. ✅ Detects environment from URL configuration
2. ✅ Populates data immediately on container startup
3. ✅ Runs scheduler for ongoing updates
4. ✅ Handles failures with multiple fallbacks
5. ✅ Works identically in dev and production

No manual intervention needed - just deploy and the container handles everything!
