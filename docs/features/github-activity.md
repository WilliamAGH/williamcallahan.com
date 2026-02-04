<!-- markdownlint-disable MD029 -->

# GitHub Activity Architecture

**Functionality:** `github-activity`

## Core Objective

To act as the high-level orchestration layer for fetching, processing, and storing comprehensive GitHub activity data. This system coordinates with underlying services to gather data from multiple GitHub API sources, process it into meaningful statistics, and persist it for fast retrieval.

## Architecture Diagram

See `github-activity.mmd` for a visual diagram illustrating how this feature orchestrates other core functionalities.

## Orchestration Flow

The GitHub Activity system coordinates several modules to produce its final output. **Like bookmarks (our other highest-traffic feature), GitHub activity relies on JSON files in S3 plus Next.js Cache Components**—we do not hit the GitHub APIs from React components or public API routes.

1. **Data Fetching & Processing (`json-handling`)**:
   - A scheduler or authorized refresh endpoint kicks off `json-handling` to gather data from GitHub’s GraphQL API, REST API, and CSV fallback.
   - The module aggregates raw data into a structured JSON payload (trailing year + all time).
   - The resulting JSON is the **source of truth** persisted to S3 before any cache is updated.

2. **Persistence (`s3-object-storage`)**:
   - Writes `github_stats_summary*.json`, `aggregated_weekly_activity.json`, and repo CSVs to S3.
   - Each environment uses suffixed filenames (e.g., `github_stats_summary-dev.json`).

3. **Caching (`caching`)**:
   - To ensure performance, the final JSON data is cached in the in-memory `ServerCacheInstance`. This is managed by the `caching` module.
   - This allows the application to serve the complex GitHub statistics rapidly without needing to hit S3 or the GitHub APIs on every request.

This orchestration model allows the GitHub Activity feature to focus on its specific domain—presenting GitHub statistics—while delegating the complex, reusable tasks of data fetching, processing, and storage to the appropriate core services.

## Data Flow & Caching

The system uses a three-tier caching hierarchy:

```
GitHub APIs -> Refresh jobs / authorized POST -> JSON in S3 -> Next.js Cache Components -> UI
                                                              |
                                                API routes (noStore, read JSON fresh)
```

| Layer                            | Purpose                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| S3 JSON                          | Source of truth (`github_stats_summary*.json`, `aggregated_weekly_activity.json`, repo CSVs) |
| Next.js Cache Components         | `cacheTag("github-activity")` with ~30 min lifetime for pages/cards                          |
| API (`GET /api/github-activity`) | Calls `unstable_noStore()`, reads JSON, returns immediately                                  |
| Legacy ServerCache               | Metadata-only; still used for instrumentation, not for trailing-year JSON                    |

## API & Data Source Strategy

A hybrid approach is used to gather comprehensive data:

- **GraphQL API**: Efficiently fetches user-level aggregated data, such as the contribution calendar and total commit counts.
- **REST API**: Used for granular, repository-specific data like contributor stats and language breakdowns.
- **CSV Export**: A fallback mechanism parses raw contribution history from a CSV file, with built-in logic to auto-repair common formatting issues.

## S3 Storage Structure

All GitHub-related data is stored under the `github/` prefix in the S3 bucket:

- `activity_data.json`: Combined activity for the trailing year and all-time.
- `github_stats_summary.json`: Summary of the trailing year's statistics.
- `github_stats_summary_all_time.json`: Summary of all-time statistics.
- `aggregated_weekly_activity.json`: Pre-calculated weekly activity.
- `repo_raw_weekly_stats/`: Raw weekly stats CSVs for each repository.

## Scheduled Data Refresh

A cron job automatically refreshes the data from GitHub's APIs to ensure it remains up-to-date.

- **Schedule**: Daily at midnight Pacific Time (`0 7 * * *` in UTC).
- **Mechanism**: A `scheduler.ts` script uses `node-cron` to trigger the `update-s3-data.ts` script. A lock is acquired to prevent multiple concurrent refresh operations.

## API Endpoints

- `GET /api/github-activity`: Retrieves the currently cached GitHub activity data.
- `POST /api/github-activity/refresh`: A protected endpoint that forces a full refresh of the GitHub data. Requires a secret token for authentication.

## Key Files & Responsibilities

### Core Data Layer

- **`src/lib/data-access/github.ts`**
  - Fetches from GitHub APIs (GraphQL + REST)
  - Manages S3 storage and caching
  - Orchestrates per-repo processing, commit totals, and summary writes
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
  - Read-only endpoint for cached data (calls `unstable_noStore()` and reads JSON directly)
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

# Inspect stored data in S3
aws s3 ls s3://$S3_BUCKET/github/
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
