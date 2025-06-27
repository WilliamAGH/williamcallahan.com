# Error and Retry Utilities Consolidation Summary

## Overview

This document summarizes the consolidation of error handling and retry utilities across the codebase. The work eliminates redundancies, standardizes error categorization, and creates a unified retry system.

## Problems Identified

### Before Consolidation

1. **5 Different Retry Implementations**
   - `lib/utils/retry.ts` - Basic retry utility
   - `lib/utils/http-client.ts` - HTTP-specific retry logic  
   - `lib/data-access/github-api.ts` - GitHub API retry configuration
   - `lib/opengraph/fetch.ts` - OpenGraph fetch retry logic
   - `lib/s3-utils.ts` - S3 read retry with custom logic

2. **Multiple Error Categorization Systems**
   - HTTP error detection in `http-client.ts`
   - S3 error handling in `s3-utils.ts`
   - GitHub-specific error handling in `github-api.ts`
   - Generic error utilities in `error-utils.ts`

3. **Scattered Memory Pressure Handling**
   - Different memory checks across services
   - Inconsistent memory pressure response

4. **Inconsistent Logging and Debug Messages**
   - Different log formats across modules
   - Inconsistent error context

## Solution Implemented

### 1. Unified Error Categorization (`types/error.ts` + `lib/utils/error-utils.ts`)

```typescript
// Centralized error categories
export enum ErrorCategory {
  NETWORK = 'network',
  HTTP = 'http', 
  S3 = 's3',
  GITHUB_API = 'github_api',
  RATE_LIMIT = 'rate_limit',
  MEMORY_PRESSURE = 'memory_pressure',
  TIMEOUT = 'timeout',
  VALIDATION = 'validation',
  SYSTEM = 'system',
  UNKNOWN = 'unknown'
}

// Smart error categorization
export function categorizeError(error: unknown, domain?: string): ErrorCategory
export function isRetryableError(error: unknown, domain?: string): boolean
```

### 2. Domain-Specific Retry Configurations (`lib/utils/retry.ts`)

```typescript
export const RETRY_CONFIGS = {
  GITHUB_API: {
    maxRetries: 5,
    baseDelay: 1000,
    maxBackoff: 30000,
    jitter: true,
    isRetryable: (error: Error) => isRetryableError(error, 'github'),
  },
  S3_OPERATIONS: {
    maxRetries: 3,
    baseDelay: 100,
    maxBackoff: 10000,
    jitter: true,
    isRetryable: (error: Error) => isRetryableError(error, 's3'),
  },
  HTTP_CLIENT: { /* ... */ },
  OPENGRAPH_FETCH: { /* ... */ },
  IMAGE_PROCESSING: { /* ... */ },
  DEFAULT: { /* ... */ },
}
```

### 3. Enhanced Retry Functions

```typescript
// Quick retry using domain configs
export async function retryWithDomainConfig<T>(
  operation: () => Promise<T>,
  domain: keyof typeof RETRY_CONFIGS
): Promise<T | null>

// Enhanced retry that throws on final failure
export async function retryWithThrow<T>(
  operation: () => Promise<T>,
  options: RetryConfig = {}
): Promise<T>
```

## Files Modified

### Updated Files

1. **`types/error.ts`**
   - Added `ErrorCategory`, `ErrorSeverity`, `CategorizedError` types
   - Centralized error type definitions

2. **`lib/utils/error-utils.ts`**
   - Enhanced with comprehensive error categorization
   - Added `isRetryableError()`, `categorizeError()`, `normalizeError()`
   - Domain-specific error detection (S3, GitHub, HTTP)

3. **`lib/utils/retry.ts`**
   - Added domain-specific retry configurations
   - Enhanced retry functions with better error handling
   - Consolidated all retry logic from across the codebase

4. **`lib/utils/http-client.ts`**
   - Simplified `isRetryableHttpError()` to delegate to centralized error utils
   - Updated `createRetryingFetch()` to use consolidated configurations

5. **`lib/data-access/github-api.ts`**
   - Removed duplicate `GITHUB_RETRY_CONFIG`
   - Updated to use `RETRY_CONFIGS.GITHUB_API`
   - Simplified retry logic

## Benefits Achieved

### 1. **DRY Principle Compliance**

- Eliminated 4 duplicate retry implementations
- Single source of truth for error categorization
- Unified retry configurations

### 2. **Improved Maintainability**

- Centralized error handling logic
- Consistent error categorization across domains
- Single place to update retry policies

### 3. **Enhanced Debugging**

- Consistent error logging format
- Better error context and categorization
- Domain-specific debug messages

### 4. **Better Error Handling**

- Smart error categorization based on domain context
- Proper retry decisions based on error type
- Consistent memory pressure handling

### 5. **Type Safety**

- Strong typing for error categories and configurations
- Better IDE support and auto-completion
- Compile-time error checking

## Usage Examples

### Using Domain-Specific Retry

```typescript
// GitHub API operations
const result = await retryWithDomainConfig(
  () => fetchContributorStats(owner, repo),
  'GITHUB_API'
);

// S3 operations  
const data = await retryWithDomainConfig(
  () => readJsonS3('path/to/file.json'),
  'S3_OPERATIONS'
);
```

### Error Categorization

```typescript
try {
  await someOperation();
} catch (error) {
  const categorized = createCategorizedError(error, 'github');
  if (categorized.isRetryable) {
    // Handle retryable error
  }
  console.log(`${categorized.category} error: ${categorized.message}`);
}
```

## Migration Guide for Other Files

To migrate other files to use the consolidated utilities:

1. **Replace custom retry logic:**
   ```typescript
   // Before
   let retries = 0;
   while (retries < maxRetries) { /* custom retry logic */ }
   
   // After
   import { retryWithDomainConfig } from '@/lib/utils/retry';
   const result = await retryWithDomainConfig(operation, 'HTTP_CLIENT');
   ```

2. **Replace custom error checking:**
   ```typescript
   // Before
   if (error.message.includes('timeout') || error.message.includes('network')) {
     // retry
   }
   
   // After  
   import { isRetryableError } from '@/lib/utils/error-utils';
   if (isRetryableError(error)) {
     // retry
   }
   ```

3. **Use centralized configurations:**
   ```typescript
   // Before
   const config = { maxRetries: 3, baseDelay: 1000 };
   
   // After
   import { RETRY_CONFIGS } from '@/lib/utils/retry';
   const config = RETRY_CONFIGS.DEFAULT;
   ```

## Next Steps

1. **Migrate remaining files** to use consolidated utilities
2. **Update tests** to use centralized error and retry logic
3. **Add monitoring** for retry attempts and error categories
4. **Consider adding** circuit breaker patterns for persistent failures

## Files That Still Need Migration

- `lib/opengraph/fetch.ts` - Replace custom retry logic
- `lib/s3-utils.ts` - Replace custom S3 read retries  
- `lib/services/unified-image-service.ts` - Update retry configurations
- `lib/batch-processing/index.ts` - Use consolidated retry configs
- Various other files with custom error handling

This consolidation significantly improves code maintainability, reduces redundancy, and provides a solid foundation for consistent error handling and retry behavior across the entire application.
