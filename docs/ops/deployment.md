# Docker Deployment Guide

Production runs as **two containers built from this repository**:

| Container | Dockerfile             | Entrypoint                | Runs                                                                                                              |
| --------- | ---------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Web       | `Dockerfile`           | `scripts/entrypoint.sh`   | Next.js server only                                                                                               |
| Scheduler | `scheduler/Dockerfile` | `scheduler/entrypoint.sh` | Initial Node data bootstrap, web-cache revalidation, sitemap submission, and cron jobs (`scheduler/scheduler.ts`) |

Both entrypoints share the DATABASE_URL rewrite + readiness gate via `scripts/entrypoint-db-gate.sh`.

## Scheduler Service (Coolify)

The scheduler deploys as a **separate Coolify resource** on the same host, using the
same environment variable set as the web app (`DATABASE_URL`, `S3_*`, `BOOKMARK_*`,
`GITHUB_*`, `GOOGLE_SEARCH_INDEXING_*`, `NEXT_PUBLIC_SITE_URL`, `API_BASE_URL`,
`NEXT_PUBLIC_S3_CDN_URL`, ...). For the current Coolify scheduler resource:

```text
NEXT_PUBLIC_SITE_URL=https://williamcallahan.com
API_BASE_URL=https://williamcallahan.com
NEXT_PUBLIC_S3_CDN_URL=https://s3-storage.callahan.cloud
INTERNAL_DATABASE_HOST=100.86.115.120
INTERNAL_DATABASE_PORT=5438
```

Two options:

1. **Docker Compose buildpack** (preferred — carries CPU/memory limits): Base Directory `/`,
   Compose file `scheduler/docker-compose.yml`. The service caps at 1 CPU / 3G so batch
   jobs can never saturate the 2-core host alongside the web app. Coolify invokes compose
   with the repo root as `--project-directory`, so the compose build context must stay `.`.
2. **Dockerfile buildpack**: Base Directory `/`, Dockerfile location `scheduler/Dockerfile`
   (set CPU/memory limits in the Coolify resource settings instead).

Keep the scheduler resource's Coolify Build Server option disabled. The compose
resource has no registry image configured, and Coolify 4.1.2 must execute the
helper/build path on `popos-sf1`; routing this resource through the global build
server (`popos-sf5`) fails before the build phase when Coolify tries to `docker exec`
the deployment helper.

The scheduler image does **not** run `next build` — it installs dependencies and runs
TypeScript directly via tsx, so its builds take minutes, not tens of minutes. No ports
are exposed. Docker allows 15 minutes for startup work; afterward, health requires the
scheduler heartbeat to be no more than two minutes old.

Scheduler startup waits for the database gate, then runs `node --run update-data` with no
operation flags. The data updater owns that default operation set, including books and search
indexes. The scheduler next reuses its canonical authenticated endpoint inventory to invalidate
bookmark, books, and GitHub web caches before sitemap submission and cron. A bootstrap or cache
revalidation failure logs an error and exits instead of serving stale data; the compose service's
`unless-stopped` restart policy retries it.

Local build + one-shot data prefetch:

```bash
bun run docker:build:scheduler
bun run docker:prefetch
```

## Quick Start

Run the web container locally:

```bash
docker build -t williamcallahan-com .
docker run -d -p 3000:3000 --name williamcallahan-com williamcallahan-com
```

## Health Checks

- **Application Health**: `curl http://localhost:3000/api/health`

## Production Database Startup Safeguards

When `NEXT_PUBLIC_SITE_URL=https://williamcallahan.com`, startup applies two safeguards:

1. `DATABASE_URL` is rewritten from the public proxy endpoint (`167.234.219.57:5438`) to the internal PostgreSQL service (`q0kks8ww044c0o4w4o4ok408:5432`).
2. The app startup is gated until the resolved database endpoint is reachable.

If PostgreSQL runs on another Tailscale-connected host, set `INTERNAL_DATABASE_HOST`
and `INTERNAL_DATABASE_PORT`; those values replace the default internal service target.
