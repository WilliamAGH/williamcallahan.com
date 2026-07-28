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
   - Runtime GitHub documents (`activity`, `summary`, `aggregated-weekly`, `repo-weekly-stats`, and `csv-checksum`) are upserted in PostgreSQL.
   - Repository-weekly repair reads PostgreSQL records, serializes them only while checking or normalizing data, and writes repaired records and checksums back to PostgreSQL.

3. **Caching (`caching`)**:
   - To ensure performance, server read paths use Next.js Cache Components with `cacheTag("github-activity")`.
   - This allows the application to serve complex GitHub statistics rapidly without re-fetching upstream APIs on every request.

This orchestration model allows the GitHub Activity feature to focus on its specific domain—presenting GitHub statistics—while delegating the complex, reusable tasks of data fetching, processing, and storage to the appropriate core services.

## Data Flow & Caching

The system uses a durable-source plus tagged-cache hierarchy:

```text
GitHub APIs -> Refresh jobs / authorized POST -> PostgreSQL github_activity_store -> Next.js Cache Components -> UI
                                                                                   |
                                                    API routes (request-time execution + no-store response headers)
```

| Layer                                | Purpose                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| PostgreSQL (`github_activity_store`) | Source of truth for activity, summary, aggregate, repository-weekly, and checksum rows   |
| Next.js Cache Components             | `cacheTag("github-activity")` with ~30 min lifetime for pages/cards                      |
| API (`GET /api/github-activity`)     | Uses `connection()` plus no-store headers and reads PostgreSQL-backed activity documents |

## API & Data Source Strategy

A hybrid approach is used to gather comprehensive data:

- **GraphQL API**: Efficiently fetches user-level aggregated data, such as the contribution calendar and total commit counts.
- **REST API**: Used for granular, repository-specific data like contributor stats and language breakdowns.
- **Repository-weekly repair**: Normalizes an in-memory CSV serialization of PostgreSQL repository-weekly records, compares its PostgreSQL checksum, and persists the repaired record. When no record exists, it fetches GitHub contributor data and creates the PostgreSQL record.

## Storage Model

Canonical runtime records live in PostgreSQL table `github_activity_store`:

- `data_type = "activity", qualifier = "global"`: combined trailing-year and all-time payload.
- `data_type = "summary", qualifier = "global"`: all-time summary-card payload.
- `data_type = "aggregated-weekly", qualifier = "global"`: aggregated weekly chart payload.
- `data_type = "repo-weekly-stats", qualifier = "owner/repo"`: per-repo weekly cache payload.
- `data_type = "csv-checksum", qualifier = "owner/repo"`: checksum used to skip unchanged repository-weekly repair work.

No active GitHub runtime or repair path falls back to S3. If historical GitHub CSV artifacts are retained, they are legacy migration or archival material only.

A confirmed empty current repository set is intentionally persisted as complete zero activity and an empty weekly aggregate, replacing prior healthy aggregates rather than retaining stale repository data. This requires the canonical explicit replacement intent; nonzero or incomplete payloads are rejected. Each accepted refresh commits its activity, all-time summary, and weekly aggregate in one database transaction, so a refusal or persistence failure leaves all three prior records intact.

## Scheduled Data Refresh

A cron job automatically refreshes the data from GitHub's APIs to ensure it remains up-to-date.

- **Schedule**: Daily at midnight Pacific Time (`0 7 * * *` in UTC).
- **Mechanism**: A `scheduler.ts` script uses `node-cron` to trigger the `data-updater.ts` script. A lock is acquired to prevent multiple concurrent refresh operations.

## API Endpoints

- `GET /api/github-activity`: Retrieves the currently cached GitHub activity data. The public response includes the contribution calendar and aggregate totals; repository identifiers and per-repository metrics remain private.
- `POST /api/github-activity/refresh`: Runs a protected refresh only in the production write environment. Read-only deployments return an explicit successful no-write result; production relays reject that result as a failed refresh.
- `POST /api/github-activity/refresh-production`: Requires a Clerk user in a non-production environment and relays the production refresh with `GITHUB_REFRESH_SECRET` in the `x-refresh-secret` header.

## Key Files & Responsibilities

### Core Data Layer

- **`src/lib/data-access/github.ts`**
  - Fetches from GitHub APIs (GraphQL + REST)
  - Manages durable persistence and caching orchestration
  - Orchestrates per-repo processing, commit totals, and summary writes
- **`src/lib/data-access/github-storage.ts`**
  - PostgreSQL-first activity persistence interface (`read*Record`/`write*Record`)
  - Delegates runtime JSON reads/writes to PostgreSQL query/mutation modules
  - Exposes activity metadata for public refresh timestamps
- **`src/lib/data-access/github-repo-stats.ts`**
  - Batch processes repository stats with PostgreSQL cache recovery and category aggregation
- **`src/lib/data-access/github-commit-counts.ts`**
  - Computes all-time commit totals (GraphQL with REST fallback)
- **`src/lib/data-access/github-contributions.ts`**
  - Fetches and flattens the contribution calendar
- **`src/lib/data-access/github-csv-repair.ts`**
  - PostgreSQL repository-weekly integrity checks, checksum comparison, and repair workflow
- **`src/lib/data-access/github-activity-summaries.ts`**
  - Builds the single all-time summary-card payload for the atomic refresh write
- **`src/lib/data-access/github-processing.ts`**
  - Shared processing helpers (category stats, weekly aggregation, and in-memory repository-weekly normalization)

### API Endpoints

- **`src/app/api/github-activity/route.ts`**
  - Read-only request-time endpoint with explicit no-store response headers
  - Never triggers refresh
- **`src/app/api/github-activity/refresh/route.ts`**
  - Production-only protected refresh endpoint with an explicit read-only response elsewhere
- **`src/app/api/github-activity/refresh-production/route.ts`**
  - Authenticated non-production relay to the production refresh endpoint

### UI Components

- **`src/components/features/github/github-activity.client.tsx`**
  - Main activity display (consumes cached JSON via `cacheTag("github-activity")`)
  - Contribution calendar

- **`src/components/features/github/cumulative-github-stats-cards.tsx`**
  - Simple stats display cards

### Supporting Files

- **`scheduler/scheduler.ts`**: Cron job scheduling
- **`scheduler/data-updater.ts`**: Data refresh script
- **`src/types/schemas/github-storage.ts`**: Canonical persisted/public activity schemas, projections, and write intents
- **`src/types/github.ts`**: Upstream GitHub API and orchestration input types

## Environment Variables

```bash
# Set one API token; aliases are checked in this order
GITHUB_ACCESS_TOKEN_COMMIT_GRAPH=ghp_xxxxxxxxxxxx
GITHUB_API_TOKEN=ghp_xxxxxxxxxxxx
GITHUB_TOKEN=ghp_xxxxxxxxxxxx

# Optional; defaults to WilliamAGH
GITHUB_REPO_OWNER=username

# SECURITY WARNING: DO NOT USE NEXT_PUBLIC_ PREFIX
# This exposes the secret in client-side code!
# WRONG: NEXT_PUBLIC_GITHUB_REFRESH_SECRET=secret
# RIGHT: GITHUB_REFRESH_SECRET=secret (server-only)
```

## Debugging

```bash
# Verify the configured GitHub API token (same alias precedence as the application)
curl -H "Authorization: bearer ${GITHUB_ACCESS_TOKEN_COMMIT_GRAPH:-${GITHUB_API_TOKEN:-${GITHUB_TOKEN:?Set one of GITHUB_ACCESS_TOKEN_COMMIT_GRAPH, GITHUB_API_TOKEN, or GITHUB_TOKEN}}}" https://api.github.com/user

# Manually trigger a data refresh
curl -X POST -H "x-refresh-secret: $GITHUB_REFRESH_SECRET" localhost:3000/api/github-activity/refresh

# Inspect PostgreSQL GitHub activity rows
psql "$DATABASE_URL" -c "select data_type, qualifier, updated_at from github_activity_store order by updated_at desc limit 20;"

# Inspect PostgreSQL repository-weekly records and their repair checksums
psql "$DATABASE_URL" -c "select data_type, qualifier, checksum, updated_at from github_activity_store where data_type in ('repo-weekly-stats', 'csv-checksum') order by updated_at desc limit 20;"
```

## Handling GitHub 202 "stats still generating" responses

GitHub's `/stats/contributors` endpoint often returns **HTTP 202** for several minutes while it prepares a repository's statistics.  
Our pipeline now recognizes this explicitly:

- `fetchContributorStats` performs a configurable retry loop (env vars `GITHUB_STATS_PENDING_MAX_ATTEMPTS`, `GITHUB_STATS_PENDING_DELAY_MS`).
  - If the endpoint keeps returning 202 after the configured attempts it throws `GitHubContributorStatsPendingError`.
- The repo-processing batch marks the repository status as `pending_202_from_api` (instead of `fetch_error`).
  - This allows the refresh job to reuse any existing PostgreSQL repository-weekly record and keep partial data flowing. When every incomplete repo is pending 202 with no failures, the refresh instead preserves the prior activity/summary/aggregate and surfaces to the scheduler as a successful no-op (no Sentry report).
- `detectAndRepairCsvFiles` treats 202 as informational and defers repair until the next run.

This guarantees that a temporary 202 cannot derail the entire refresh while still ensuring that new data is picked up automatically on subsequent cycles.

### Handling authoritative empty contributor responses

A successful contributor response that omits the configured owner, has no weeks for that owner, or returns HTTP 204 is complete no-contribution evidence. The refresh replaces that repository's `repo-weekly-stats` record with `status = "empty_no_user_contribs"` and an empty stats array; it never reuses prior stats. PostgreSQL cache reuse is limited to pending and failure states.

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
