# Docker Deployment Guide

Production runs as **two containers built from this repository**:

| Container | Dockerfile             | Entrypoint                | Runs                                                                             |
| --------- | ---------------------- | ------------------------- | -------------------------------------------------------------------------------- |
| Web       | `Dockerfile`           | `scripts/entrypoint.sh`   | Next.js server only                                                              |
| Scheduler | `scheduler/Dockerfile` | `scheduler/entrypoint.sh` | Cron jobs (`scheduler/scheduler.ts`), initial data populator, sitemap submission |

Both entrypoints share the DATABASE_URL rewrite + readiness gate via `scripts/entrypoint-db-gate.sh`.

## Scheduler Service (Coolify)

The scheduler deploys as a **separate Coolify resource** on the same host, using the
same environment variable set as the web app (`DATABASE_URL`, `S3_*`, `BOOKMARK_*`,
`GITHUB_*`, `GOOGLE_SEARCH_INDEXING_*`, `NEXT_PUBLIC_SITE_URL`, ...). Two options:

1. **Docker Compose buildpack** (preferred — carries CPU/memory limits): Base Directory `/`,
   Compose file `scheduler/docker-compose.yml`. The service caps at 1 CPU / 3G so batch
   jobs can never saturate the 2-core host alongside the web app.
2. **Dockerfile buildpack**: Base Directory `/`, Dockerfile location `scheduler/Dockerfile`
   (set CPU/memory limits in the Coolify resource settings instead).

The scheduler image does **not** run `next build` — it installs dependencies and runs
TypeScript directly via tsx, so its builds take minutes, not tens of minutes. No ports
are exposed; health is a `pgrep` check on the scheduler process.

Local build + one-shot data prefetch:

```bash
bun run docker:build:scheduler
bun run docker:prefetch
```

## Quick Start (Ephemeral)

Run the container with ephemeral storage (logos clear on restart):

```bash
docker build -t williamcallahan-com .
docker run -d -p 3000:3000 --name williamcallahan-com williamcallahan-com
```

## Production Setup (Persistent)

For production, mount a volume to persist downloaded logos:

```bash
# 1. Create storage volume
docker volume create logo_storage

# 2. Build image
docker build -t williamcallahan-com .

# 3. Run with volume mount
docker run -d \
  -p 3000:3000 \
  -v logo_storage:/app/data/images/logos \
  --name williamcallahan-com \
  williamcallahan-com
```

## Maintenance Operations

### Fix Permissions

If you encounter permission issues with the volume:

```bash
docker run --rm -v logo_storage:/data alpine chown -R 1001:1001 /data
```

### Backup Logos

Create a tarball of the logo storage:

```bash
docker run --rm -v logo_storage:/data:ro -v "$(pwd):/backup" alpine \
  tar czf /backup/logos-backup-$(date +%Y%m%d).tar.gz -C /data .
```

### Restore Logos

Restore from a backup tarball:

```bash
docker run --rm -v logo_storage:/data -v "$(pwd):/backup" alpine \
  sh -c "tar xzf /backup/logos-backup-YYYYMMDD.tar.gz -C /data && chown -R 1001:1001 /data"
```

## Health Checks

- **Application Health**: `curl http://localhost:3000/api/health`

## Production Database Startup Safeguards

When `NEXT_PUBLIC_SITE_URL=https://williamcallahan.com`, startup applies two safeguards:

1. `DATABASE_URL` is rewritten from the public proxy endpoint (`167.234.219.57:5438`) to the internal PostgreSQL service (`q0kks8ww044c0o4w4o4ok408:5432`).
2. The app startup is gated until the resolved database endpoint is reachable.
