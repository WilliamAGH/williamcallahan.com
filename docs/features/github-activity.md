<!-- markdownlint-disable MD029 -->

# GitHub Activity Architecture

**Functionality:** `github-activity`

## Core Objective

To act as the high-level orchestration layer for fetching, processing, and storing comprehensive GitHub activity data. This system coordinates with underlying services to gather data from multiple GitHub API sources, process it into meaningful statistics, and persist it for fast retrieval.

## Architecture Diagram

See `github-activity.mmd` for a visual diagram illustrating how this feature orchestrates other core functionalities.

## Orchestration Flow

The GitHub Activity system coordinates several modules to produce its final output. **Like bookmarks (our other highest-traffic feature), GitHub activity is PostgreSQL-first for runtime JSON payloads plus Next.js Cache Components**—we do not hit the GitHub APIs from React components or public API routes.

1. **Data Fetching & Processing (`json-handling`)**:
   - A scheduler or authorized refresh endpoint kicks off `json-handling` to gather data from GitHub’s GraphQL API and REST API.
   - The module aggregates raw data into a structured JSON payload (trailing year + all time).
   - The resulting JSON is persisted to PostgreSQL (`github_activity_store`) before cache invalidation.

2. **Persistence (`data-access` + `db`)**:
   - Runtime GitHub documents (`activity`, `summary`, `aggregated-weekly`, `repo-weekly-stats`) are upserted in PostgreSQL.
   - Raw repository weekly CSV payloads may remain durable binary artifacts in S3 for operational diagnostics, but runtime reads are PostgreSQL-only.

3. **Caching (`caching`)**:
   - To ensure performance, server read paths use Next.js Cache Components with `cacheTag("github-activity")`.
   - This allows the application to serve complex GitHub statistics rapidly without re-fetching upstream APIs on every request.

This orchestration model allows the GitHub Activity feature to focus on its specific domain—presenting GitHub statistics—while delegating the complex, reusable tasks of data fetching, processing, and storage to the appropriate core services.

## Data Flow & Caching

The system uses a durable-source plus tagged-cache hierarchy:

```
GitHub APIs -> Refresh jobs / authorized POST -> PostgreSQL github_activity_store -> Next.js Cache Components -> UI
                                                                                   |
                                                                     API routes (noStore, read DB fresh)
```

| Layer                                | Purpose                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| PostgreSQL (`github_activity_store`) | Source of truth for GitHub activity/summary/aggregated documents                            |
| S3 CSV artifacts                     | Optional archival/diagnostic artifacts (`repo_raw_weekly_stats/*.csv`)                      |
| Next.js Cache Components             | `cacheTag("github-activity")` with ~30 min lifetime for pages/cards                         |
| API (`GET /api/github-activity`)     | Calls `unstable_noStore()`, reads PostgreSQL-backed activity documents, returns immediately |

## API & Data Source Strategy

A hybrid approach is used to gather comprehensive data:

- **GraphQL API**: Efficiently fetches user-level aggregated data, such as the contribution calendar and total commit counts.
- **REST API**: Used for granular, repository-specific data like contributor stats and language breakdowns.
- **CSV Export**: Optional archival/repair input for operational scripts; runtime GitHub weekly reads do not depend on CSV parsing.

## Storage Model

Canonical runtime records live in PostgreSQL table `github_activity_store`:

- `data_type = "activity", qualifier = "global"`: combined trailing-year and all-time payload.
- `data_type = "summary", qualifier = "global"`: summary card payload.
- `data_type = "aggregated-weekly", qualifier = "global"`: aggregated weekly chart payload.
- `data_type = "repo-weekly-stats", qualifier = "owner/repo"`: per-repo weekly cache payload.

S3 can still hold raw CSV artifacts under the GitHub prefix (`repo_raw_weekly_stats/*.csv`) for operational diagnostics, but canonical runtime reads are PostgreSQL-only.

## Scheduled Data Refresh

A cron job automatically refreshes the data from GitHub's APIs to ensure it remains up-to-date.

- **Schedule**: Daily at midnight Pacific Time (`0 7 * * *` in UTC).
- **Mechanism**: A `scheduler.ts` script uses `node-cron` to trigger the `data-updater.ts` script. A lock is acquired to prevent multiple concurrent refresh operations.

## API Endpoints

- `GET /api/github-activity`: Retrieves the currently cached GitHub activity data.
- `POST /api/github-activity/refresh`: A protected endpoint that forces a full refresh of the GitHub data. Requires a secret token for authentication.

## Key Files & Responsibilities

### Core Data Layer

- **`src/lib/data-access/github.ts`**
  - Fetches from GitHub APIs (GraphQL + REST)
  - Manages durable persistence and caching orchestration
  - Orchestrates per-repo processing, commit totals, and summary writes
- **`src/lib/data-access/github-storage.ts`**
  - PostgreSQL-first activity persistence interface (`read*Record`/`write*Record`)
  - Delegates runtime JSON reads/writes to PostgreSQL query/mutation modules
  - Exposes metadata/listing helpers for cache invalidation paths
- **`src/lib/data-access/github-repo-stats.ts`**
  - Batch processes repo stats with CSV fallback and category aggregation
- **`src/lib/data-access/github-commit-counts.ts`**
  - Computes all-time commit totals (GraphQL with REST fallback)
- **`src/lib/data-access/github-contributions.ts`**
  - Fetches and flattens the contribution calendar
- **`src/lib/data-access/github-csv-repair.ts`**
  - CSV integrity checks and repair workflow
- **`src/lib/data-access/github-activity-summaries.ts`**
  - Writes trailing-year and all-time summary JSON payloads
- **`src/lib/data-access/github-processing.ts`**
  - Shared processing helpers (category stats, CSV repair utilities)

### API Endpoints

- **`src/app/api/github-activity/route.ts`**
  - Read-only endpoint for cached data (calls `unstable_noStore()` and reads PostgreSQL-backed payloads)
  - Never triggers refresh
- **`src/app/api/github-activity/refresh/route.ts`**
  - Protected refresh endpoint

### UI Components

- **`src/components/features/github/github-activity.client.tsx`**
  - Main activity display (consumes cached JSON via `cacheTag("github-activity")`)
  - Contribution calendar

- **`src/components/features/github/cumulative-github-stats-cards.tsx`**
  - Simple stats display cards

### Supporting Files

- **`src/lib/server/scheduler.ts`**: Cron job scheduling
- **`scripts/data-updater.ts`**: Data refresh script
- **`src/types/github.ts`**: Type definitions

## Environment Variables

```bash
# Required for API access
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
GITHUB_USERNAME=username

# SECURITY WARNING: DO NOT USE NEXT_PUBLIC_ PREFIX
# This exposes the secret in client-side code!
# WRONG: NEXT_PUBLIC_GITHUB_REFRESH_SECRET=secret
# RIGHT: GITHUB_REFRESH_SECRET=secret (server-only)

# Optional
GITHUB_CONTRIBUTION_CSV_URL=https://...
```

## Debugging

```bash
# Verify the GitHub API token
curl -H "Authorization: bearer $GITHUB_TOKEN" https://api.github.com/user

# Manually trigger a data refresh
curl -X POST -H "x-refresh-secret: $GITHUB_REFRESH_SECRET" localhost:3000/api/github-activity/refresh

# Inspect PostgreSQL GitHub activity rows
psql "$DATABASE_URL" -c "select data_type, qualifier, updated_at from github_activity_store order by updated_at desc limit 20;"

# Inspect raw CSV artifacts in S3 (fallback layer)
aws s3 ls s3://$S3_BUCKET/github/repo_raw_weekly_stats/
```

## Handling GitHub 202 "stats still generating" responses

GitHub's `/stats/contributors` endpoint often returns **HTTP 202** for several minutes while it prepares a repository's statistics.  
Our pipeline now recognizes this explicitly:

- `fetchContributorStats` performs a configurable retry loop (env vars `GITHUB_STATS_PENDING_MAX_ATTEMPTS`, `GITHUB_STATS_PENDING_DELAY_MS`).
  - If the endpoint keeps returning 202 after the configured attempts it throws `GitHubContributorStatsPendingError`.
- The repo-processing batch marks the repository status as `pending_202_from_api` (instead of `fetch_error`).
  - This allows the refresh job to fall back to any existing CSV and keep partial data flowing.
- `detectAndRepairCsvFiles` treats 202 as informational and defers repair until the next run.

This guarantees that a temporary 202 cannot derail the entire refresh while still ensuring that new data is picked up automatically on subsequent cycles.

```env
# Optional tuning (defaults shown)
GITHUB_STATS_PENDING_MAX_ATTEMPTS=4
GITHUB_STATS_PENDING_DELAY_MS=10000  # 10s starting delay, doubles each retry
```

### Handling GitHub 403 rate-limit responses

If the `/stats/contributors` endpoint returns **HTTP 403** due to secondary rate limiting:

- `fetchContributorStats` throws `GitHubContributorStatsRateLimitError` immediately (no retries to avoid hammering).
- The repo processor marks the repo as `pending_rate_limit`.
- The refresh job exits gracefully; the repo will be retried on the next scheduled run.

This prevents a single rate-limited repo from failing the entire refresh.

```env
# Optionally tune global delay/retry with the same envs used for 202 handling
GITHUB_STATS_PENDING_MAX_ATTEMPTS=4
GITHUB_STATS_PENDING_DELAY_MS=10000
```

---
