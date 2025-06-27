# GitHub.ts Flattening Plan

## Current State
- **File**: `lib/data-access/github.ts`
- **Size**: 1,410 lines (exceeds 500-line limit by 910 lines)
- **Issues**: Mixed responsibilities, potential circular dependencies, redundant implementations

## Existing Utilities to Leverage

### 1. S3 Operations (Currently ~200 lines can be removed)
**Current code in github.ts:**
- Custom S3 read/write operations
- Inline error handling
- Manual retry logic

**Replace with existing `lib/s3-utils.ts`:**
```typescript
// Instead of custom implementations, use:
import { 
  readJsonS3, writeJsonS3, 
  readBinaryS3, writeBinaryS3,
  listS3Objects as s3UtilsListS3Objects,
  getS3ObjectMetadata 
} from "@/lib/s3-utils";
```

### 2. Retry Logic (Currently ~75 lines can be removed)
**Current code in github.ts:**
- `fetchWithRetry()` function (lines 129-202)
- Custom exponential backoff implementation

**Replace with existing `lib/utils/retry.ts`:**
```typescript
import { retryWithOptions } from "@/lib/utils/retry";

// Replace fetchWithRetry with:
const response = await retryWithOptions(
  () => fetch(url, options),
  {
    maxRetries: 5,
    shouldRetry: (error, attempt, response) => 
      response?.status === 202 || !response,
    onRetry: (error, attempt) => 
      console.log(`Retry ${attempt} for ${url}`)
  }
);
```

### 3. Rate Limiting (New functionality, ~50 lines to add protection)
**Current issue:**
- No rate limiting for GitHub API calls
- Risk of hitting API limits

**Add using existing `lib/rate-limiter.ts`:**
```typescript
import { isOperationAllowed, waitForPermit } from "@/lib/rate-limiter";

// Before API calls:
await waitForPermit('github-api', {
  maxRequests: 5000,
  windowMs: 60 * 60 * 1000 // 1 hour
});
```

### 4. Caching (Already using ServerCacheInstance correctly)
**Current usage is good:**
- Using `ServerCacheInstance` for in-memory caching
- No changes needed here

### 5. Constants (Currently ~30 lines can be moved)
**Current code in github.ts:**
- Inline S3 paths and constants
- Environment variable definitions

**Move to `lib/constants.ts`:**
```typescript
// Add to constants.ts:
export const GITHUB_ACTIVITY_S3_PATHS = {
  DIR: 'github/',
  ACTIVITY_DATA: 'github/activity_data.json',
  STATS_SUMMARY: 'github/github_stats_summary.json',
  // ... etc
};
```

## Proposed Module Structure

### 1. `lib/data-access/github/api.ts` (~300 lines)
- GraphQL queries and types
- REST API calls
- `fetchRepositoryList()`
- `fetchContributionCalendar()`
- `fetchRepositoryStats()`
- `fetchCommitCounts()`

### 2. `lib/data-access/github/processors.ts` (~250 lines)
- `processWeeklyStats()`
- `aggregateRepositoryData()`
- `calculateCategoryStats()`
- `mapGraphQLContributionLevelToNumeric()`

### 3. `lib/data-access/github/storage.ts` (~200 lines)
- `detectAndRepairCsvFiles()`
- `calculateAndStoreAggregatedWeeklyActivity()`
- CSV file operations
- S3 storage coordination

### 4. `lib/data-access/github/index.ts` (~400 lines)
- Main orchestration functions
- `refreshGitHubActivityDataFromApi()`
- `getGithubActivity()`
- `getGithubActivityCached()`
- Cache invalidation functions
- Export all public APIs

## Implementation Steps

1. **Extract API calls** to `github/api.ts`
   - Move GraphQL queries
   - Move REST API fetch functions
   - Use `retryWithOptions` from retry utils

2. **Extract processing logic** to `github/processors.ts`
   - Move data transformation functions
   - Move aggregation logic
   - Keep pure functions without side effects

3. **Extract storage operations** to `github/storage.ts`
   - Move CSV repair functionality
   - Move weekly activity aggregation
   - Use existing S3 utils

4. **Update main file** to orchestrate
   - Keep only high-level coordination
   - Import from new modules
   - Maintain public API surface

5. **Add rate limiting**
   - Protect all API endpoints
   - Use existing rate limiter

6. **Update imports** in dependent files
   - Update API routes
   - Update test files
   - Update type imports

## Expected Results
- **Total lines**: ~1,150 (down from 1,410)
- **Largest file**: ~400 lines (index.ts)
- **Better separation of concerns**
- **Reuse of existing utilities**
- **Easier to test and maintain**

## Validation Steps
1. Run `bun run validate`
2. Run `bun run test:coverage`
3. Test API endpoints manually
4. Verify S3 operations
5. Check for circular dependencies