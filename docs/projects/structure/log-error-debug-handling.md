# Log, Error, Debug, Network & Handling Architecture

**Functionality:** `log-error-debug-handling`

## Core Objective

To provide comprehensive logging, error handling, debugging, network resilience, and monitoring capabilities throughout the application. This includes structured logging, error boundaries, debug utilities, retry mechanisms, health monitoring endpoints, and integration with error tracking services like Sentry.

## Architecture Overview

The system provides multiple layers of observability and resilience:

1. **Logging** - Centralized, controllable logging with environment awareness
2. **Error Handling** - Type-safe error management with recovery mechanisms
3. **Debugging** - Conditional debug output and diagnostic endpoints
4. **Monitoring** - Health checks, error tracking, and performance monitoring
5. **Network Resilience** - Retry mechanisms with exponential backoff for transient failures

## Key Files and Responsibilities

### Logging Infrastructure

#### Core Logger

- **`lib/logger.ts`**: Global logging singleton
  - Wraps `console.warn` and `console.error` methods
  - Contains private `isSilent` flag for test environments
  - Exposes `setSilent(boolean)` for global control
  - Used by components and API routes for consistent logging

#### Environment-Aware Logger

- **`lib/utils/logger.ts`**: Environment-based logging utility
  - Provides log levels: `debug`, `info`, `warn`, `error`
  - Controlled by `DEBUG` and `VERBOSE` environment variables
  - Wraps console object with conditional output

#### Debug Utilities

- **`lib/utils/debug.ts`**: Conditional debugging functions
  - `debug()`, `debugWarn()`, `debugError()` functions
  - Only logs when `NODE_ENV` is 'development' or `--debug` flag present
  - Helps reduce noise in production logs

### Error Handling

#### Type Definitions

- **`types/error.ts`**: Core error type definitions
  - `ExtendedError`: Base error interface with timestamp tracking
  - `BookmarkError`: Specialized error for bookmark operations
  - `GitHubActivityError`: Specialized error for GitHub API operations
  - Type guards: `hasLastFetched()`, `hasLastFetchedTimestamp()`
  - Utility functions: `getErrorMessage()`, `getErrorTimestamp()`
  - **🟡 ISSUES**:
    - Duplicate timestamp properties (`lastFetched` vs `lastFetchedTimestamp`)
    - Inconsistent naming conventions
    - Type guards should be in separate utility file

#### Custom Error Classes

- **`lib/errors.ts`**: Application-specific error classes
  - Extends built-in Error class with additional context
  - Provides error categorization and metadata

#### React Error Boundaries

- **`components/ui/error-boundary.client.tsx`**: Generic error boundary
  - Catches React component errors
  - Provides fallback UI
  - Logs errors to tracking service

#### Page-Level Error Handling

- **`app/error.tsx`**: App Router error page
- **`app/global-error.tsx`**: Global error boundary
- **`app/not-found.tsx`**: 404 error page
- **`app/bookmarks/error.tsx`**: Bookmarks section error UI

### Debug & Monitoring Endpoints

#### API Routes

1. **`/api/debug/posts`**
   - Provides detailed debugging info about blog posts
   - Secured with `DEBUG_API_SECRET` Bearer token
   - Returns 403 Forbidden in production
   - Fixed async operations using `Promise.all`
   - **Issues**: Uses console instead of structured logging
   - **Runtime Guarantee (2025-11)**: Uses `request.headers` directly (no `next/headers()` dependency) so bearer
     tokens are evaluated at request time even with `cacheComponents` enabled.

2. **`/api/health`**
   - Basic health check endpoint (public)
   - Returns status, timestamp, environment info
   - Includes cache statistics
   - **Issues**: Exposes potentially sensitive information
   - Metrics companion route (`/api/health/metrics`) now requires a bearer token and also reads directly from
     `request.headers`, eliminating the prerender bailout we observed earlier without relying on dynamic segments
     (2025-11 update).

3. **`/api/ip`**
   - Returns client's real IP address (public)
   - Extracts from Cloudflare/proxy headers
   - **Issues**: No rate limiting

4. **`/api/log-client-error`**
   - Receives and logs client-side errors
   - Provides server-side logging for browser errors

5. **`/api/tunnel`**
   - Proxies Sentry events to avoid CORS
   - **Issues**: No rate limiting or request size limits

6. **`/sentry-example-page`**
   - Client-side page for testing Sentry integration
   - Tests SDK connectivity and error tracking

#### Debugging Scripts

- **`scripts/debug-test-bookmark.ts`**: Diagnostic script for bookmark debugging
  - Checks fetch mocking
  - Verifies environment variables
  - Tests fetch behavior
  - Detects test artifacts

### Middleware Protection

- Blocks `/api/debug/*` routes in production (middleware.ts line 64)
- Returns 404 for debug endpoints in production environment

### Instrumentation

- **`instrumentation.ts`**: Server-side instrumentation setup
- **`instrumentation-client.ts`**: Client-side instrumentation setup

### Network Resilience

#### Retry Utilities

- **`lib/utils/retry.ts`**: Generic retry operation functionality
  - Provides `retryOperation` function for async operations
  - Implements exponential backoff strategy
  - Crucial for handling transient network errors
  - Improves application resilience for API calls
  - **🟡 ISSUES**:
    - Returns null on failure, losing error context
    - Should throw errors to preserve failure information

## Error Flow Hierarchy

1. **Type Guards** (earliest detection)
   - Validate data at boundaries
   - Prevent errors from propagating

2. **Try-Catch Blocks** (function level)
   - Handle expected errors
   - Transform errors for upper layers

3. **Error Boundaries** (component level)
   - Catch React rendering errors
   - Provide fallback UI

4. **Route Error Pages** (page level)
   - Handle navigation errors
   - Server-side errors

5. **Global Error Handler** (application level)
   - Last resort error handling
   - Critical error recovery

## State & Data Flow

- **Normal Operation**: Component calls `logger.warn("Warning")` → Logger checks `isSilent` is false → Calls `console.warn`
- **Test Operation**: Setup calls `logger.setSilent(true)` → Logger checks fail → No console output
- **Error Flow**: Error thrown → Caught by boundary → Logged to Sentry → User sees fallback UI
- **Debug Flow**: Debug mode check → Conditional output → Development-only logging
- **Network Retry Flow**: API call fails → Retry with exponential backoff → Success or final failure → Return result or null

## Security Considerations

### 🔴 CRITICAL Priority Issues

1. **Server/Client Boundary Violations**
   - `lib/search.ts` imports from `.bookmarks.client` causing production crashes
   - **Fix**: Separate client and server search implementations

2. **Unstructured Error Logging**
   - Widespread use of `console.log/error` instead of centralized logger
   - **Fix**: Replace all console statements with structured logger

### 🟡 MEDIUM Priority Issues

1. **Ambiguous Error Handling**
   - `lib/imageCompare.ts` returns false for both errors and mismatches
   - `lib/utils/retry.ts` returns null on failure, losing error context
   - **Fix**: Throw errors to distinguish from legitimate false results

2. **Information Disclosure**
   - `app/api/github-activity/refresh/route.ts` leaks env var names
   - Health endpoint exposes system details
   - **Fix**: Sanitize error messages in production

3. **Rate Limiting**
   - No rate limiting on any debug/monitoring endpoints
   - **Fix**: Add rate limiting middleware

### 🟢 LOW Priority Issues

1. **Stack Trace Information**
   - Full stack traces visible in development
   - **Fix**: Ensure production builds strip traces

2. **Missing Error Boundaries**
   - Some high-risk components lack error boundary protection
   - **Fix**: Add error boundaries to data fetching components

## Best Practices

### Error Creation

- Use specific error types for different domains
- Include relevant context in error objects
- Maintain error message consistency

### Error Handling

```typescript
try {
  const data = await fetchAPI();
} catch (error) {
  if (error instanceof BookmarkError) {
    // Handle bookmark-specific error
  }
  throw new ExtendedError("API request failed", { cause: error });
}
```

### Component Error Boundaries

```typescript
<ErrorBoundary fallback={<ErrorFallback />}>
  <RiskyComponent />
</ErrorBoundary>
```

### Structured Logging

```typescript
logger.error("Operation failed", {
  error,
  context: { userId, operation },
});
```

### Network Retry

```typescript
const result = await retryOperation(async () => await fetchAPI(url), { maxRetries: 3, delay: 1000 });
if (!result) {
  // Handle final failure
}
```

## Integration Points

- **Sentry Integration**: Automatic error reporting with context
- **Monitoring**: Errors trigger alerts and metrics
- **User Experience**: Error UI components provide feedback
- **Development**: Enhanced error messages in dev mode
- **Testing**: Silent mode for test environments
- **Network Operations**: Retry logic for all external API calls
- **Mock Testing**: Node-fetch mock for network testing

## Improvements Needed

### Immediate Actions Required

1. **Implement Rate Limiting**: Add rate limiting to all endpoints
2. **Reduce Health Info**: Limit health endpoint to status only
3. **Structured Logging**: Replace console.\* with logger.ts
4. **Request Size Limits**: Add body size limits to tunnel endpoint

### Medium-term Improvements

1. **Centralized Authentication**: Middleware-based auth for debug endpoints
2. **Type Consistency**: Fix duplicate timestamp properties
3. **Error Recovery**: Implement automatic retry for transient errors
4. **Circuit Breaker**: Add pattern for failing services

### Long-term Enhancements

1. **Error Analytics**: Track patterns and frequencies
2. **Performance Monitoring**: Add metrics collection
3. **Distributed Tracing**: Implement request correlation
4. **Error Budgets**: Set up SLOs and monitoring

## Testing Considerations

- Error boundary tests
- Error recovery mechanisms
- Message sanitization verification
- Server/client separation tests
- Mock implementations for test environments
- Network retry logic tests
- Exponential backoff verification

## Notes

- The global `isSilent` flag in logging is simple but effective for this project's scale
- In larger applications, consider dependency injection or context-based systems
- The logging system captures both client-side and server-side events
- Debug endpoints are development tools and must be properly secured in production
