# GitHub Activity Architecture

**Functionality:** `github-activity`

## Core Objective

To act as the high-level orchestration layer for fetching, processing, and storing comprehensive GitHub activity data. This system coordinates with underlying services to gather data from multiple GitHub API sources, process it into meaningful statistics, and persist it for fast retrieval.

## Critical Security & Performance Issues

### 🔴 CRITICAL Security Vulnerability

1. **Exposed Refresh Secret**
   - **Issue**: `NEXT_PUBLIC_GITHUB_REFRESH_SECRET` exposes the refresh secret in client-side code
   - **Impact**: Anyone can trigger unlimited refreshes, exhausting GitHub API rate limits
   - **Fix**: Remove public secret, implement server-side scheduled refreshes

### 🟠 HIGH Priority Issues

2. **Cache Never Expires**
   - **Issue**: `ServerCacheInstance` has no TTL configuration
   - **Impact**: Stale data served indefinitely until process restart
   - **Fix**: Add TTL of 30 minutes for cache entries

3. **No Rate Limiting**
   - **Issue**: Refresh endpoint has no rate limiting
   - **Impact**: Vulnerable to DoS attacks
   - **Fix**: Implement rate limiting middleware

4. **Unbounded API Calls**
   - **Issue**: Commit counting loop has no upper limit
   - **Impact**: Large repos can trigger hundreds of API calls
   - **Fix**: Add MAX_COMMIT_PAGES limit

5. **Data Consistency**
   - **Issue**: All-time stats can be lower than trailing year
   - **Impact**: Confusing data display
   - **Fix**: Ensure all-time stats are always >= trailing year

## Architecture Diagram

See `github-activity.mmd` for a visual diagram illustrating how this feature orchestrates other core functionalities.

## Orchestration Flow

The GitHub Activity system coordinates several modules to produce its final output:

1. **Data Fetching & Processing (`json-handling`)**:
    * The process is initiated by invoking the `json-handling` functionality.
    * This core service is responsible for the complex task of fetching data from multiple GitHub sources (GraphQL API, REST API, and a CSV export fallback).
    * It handles the aggregation and processing of this raw data, producing a structured JSON object containing contribution calendars, language statistics, and repository breakdowns.

2. **Persistence (`s3-object-storage`)**:
    * Once the `json-handling` module returns the final, processed JSON data, the GitHub Activity orchestrator passes it to the `s3-object-storage` service.
    * This service is responsible for writing the `github_stats_summary.json` and related files to the S3 bucket, ensuring the data is stored persistently.

3. **Caching (`caching`)**:
    * To ensure performance, the final JSON data is cached in the in-memory `ServerCacheInstance`. This is managed by the `caching` module.
    * This allows the application to serve the complex GitHub statistics rapidly without needing to hit S3 or the GitHub APIs on every request.

This orchestration model allows the GitHub Activity feature to focus on its specific domain—presenting GitHub statistics—while delegating the complex, reusable tasks of data fetching, processing, and storage to the appropriate core services.

## Data Flow & Caching

The system uses a three-tier caching hierarchy:

```
GitHub APIs (GraphQL + REST)
  ↓ (fetchWithRetry, CSV repair)
Server process (Next.js)
  ↓ writes
S3 Storage
  ↑ reads (getGithubActivity)
In-memory Cache (ServerCacheInstance)
  → GET /api/github-activity
    → React components (client)
      → UI rendering
```

### Current Caching Issues:

1. **In-Memory Cache**: 
   - **Problem**: No TTL, data never expires
   - **Current**: Cached indefinitely
   - **Should be**: 30-minute TTL

2. **S3 Storage**: 
   - Works correctly as persistent storage
   - ~50-100ms retrieval time

3. **GitHub API**:
   - **Problem**: No global rate limit protection
   - **Risk**: Can exhaust 5000 req/hour limit

## API & Data Source Strategy

A hybrid approach is used to gather comprehensive data:

* **GraphQL API**: Efficiently fetches user-level aggregated data, such as the contribution calendar and total commit counts.
* **REST API**: Used for granular, repository-specific data like contributor stats and language breakdowns.
* **CSV Export**: A fallback mechanism parses raw contribution history from a CSV file, with built-in logic to auto-repair common formatting issues.

## S3 Storage Structure

All GitHub-related data is stored under the `github/` prefix in the S3 bucket:

* `activity_data.json`: Combined activity for the trailing year and all-time.
* `github_stats_summary.json`: Summary of the trailing year's statistics.
* `github_stats_summary_all_time.json`: Summary of all-time statistics.
* `aggregated_weekly_activity.json`: Pre-calculated weekly activity.
* `repo_raw_weekly_stats/`: Raw weekly stats CSVs for each repository.

## Scheduled Data Refresh

A cron job automatically refreshes the data from GitHub's APIs to ensure it remains up-to-date.

* **Schedule**: Daily at midnight Pacific Time (`0 7 * * *` in UTC).
* **Mechanism**: A `scheduler.ts` script uses `node-cron` to trigger the `update-s3-data.ts` script. A lock is acquired to prevent multiple concurrent refresh operations.

## API Endpoints

* `GET /api/github-activity`: Retrieves the currently cached GitHub activity data.
* `POST /api/github-activity/refresh`: A protected endpoint that forces a full refresh of the GitHub data. Requires a secret token for authentication.

## Key Files & Responsibilities

### Core Data Layer
- **`lib/data-access/github.ts`** (600+ lines - needs refactoring)
  - Fetches from GitHub APIs (GraphQL + REST)
  - Manages S3 storage and caching
  - Handles CSV repair and data aggregation
  - **Issues**: Too large, needs splitting

### API Endpoints
- **`app/api/github-activity/route.ts`**
  - Read-only endpoint for cached data
  - Never triggers refresh
  
- **`app/api/github-activity/refresh/route.ts`**
  - Protected refresh endpoint
  - **Issue**: Uses exposed public secret
  - **Issue**: No rate limiting

### UI Components
- **`components/features/github/github-activity.client.tsx`**
  - Main activity display
  - Contribution calendar
  - **Issue**: References build-time env var at runtime

- **`components/features/github/cumulative-github-stats-cards.tsx`**
  - Simple stats display cards

### Supporting Files
- **`scripts/scheduler.ts`**: Cron job scheduling
- **`scripts/update-s3-data.ts`**: Data refresh script
- **`types/github.ts`**: Type definitions

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

## Architectural Issues

### Code Quality
1. **Function Length**: `refreshGitHubActivityDataFromApi` is 600+ lines
2. **Retry Logic**: Retries on 4xx errors (wastes API calls)
3. **Concurrent Calls**: Can spawn unlimited parallel API calls

### Data Consistency
- All-time stats calculation doesn't ensure consistency
- Only `totalContributions` is reconciled
- Lines added/removed can be inconsistent

### Performance
- No request deduplication
- No health metrics
- Memory usage unbounded

## Debugging

```bash
# Verify the GitHub API token
curl -H "Authorization: bearer $GITHUB_TOKEN" https://api.github.com/user

# Manually trigger a data refresh
curl -X POST -H "x-refresh-secret: $GITHUB_REFRESH_SECRET" localhost:3000/api/github-activity/refresh

# Inspect stored data in S3
aws s3 ls s3://$S3_BUCKET/github/
```
