# Analytics System Architecture

## Overview

The analytics system provides pageview tracking using both Plausible and Umami analytics services. It includes a queue system to ensure no events are lost during script initialization.

## Key Components

### 1. Analytics Component
[`components/analytics/Analytics.tsx`](../components/analytics/Analytics.tsx)
- Handles script loading and initialization
- Tracks pageviews on route changes
- Implements error handling and debug logging
- Uses lazy loading strategy for analytics scripts

### 2. Queue System
[`lib/analytics/queue.ts`](../lib/analytics/queue.ts)
- Queues events when scripts aren't loaded
- Uses sessionStorage for persistence
- Implements deduplication and retry logic
- Provides batch processing capabilities

### 3. Type Definitions
[`types/analytics.ts`](../types/analytics.ts)
- Defines shared types for analytics events
- Provides type safety for tracking functions
- Documents analytics provider interfaces

### 4. Plausible Initialization
[`public/scripts/plausible-init.js`](../public/scripts/plausible-init.js)
- Initializes Plausible with queue support
- Allows tracking before script loads
- Queues events for later processing

## Event Flow

1. Page Load/Route Change:
   ```mermaid
   sequenceDiagram
       participant Page
       participant Analytics
       participant Queue
       participant Plausible
       participant Umami

       Page->>Analytics: Route Change
       Analytics->>Analytics: Check Scripts Loaded
       alt Scripts Not Ready
           Analytics->>Queue: Queue Event
       else Scripts Ready
           Analytics->>Plausible: Track Pageview
           Analytics->>Umami: Track Pageview
       end
   ```

2. Script Load:
   ```mermaid
   sequenceDiagram
       participant Script
       participant Analytics
       participant Queue
       participant Provider

       Script->>Analytics: onLoad Event
       Analytics->>Queue: Process Queued Events
       Queue->>Provider: Send Events
   ```

## Configuration

### Environment Variables
- `NEXT_PUBLIC_UMAMI_WEBSITE_ID`: Umami website identifier
- `NEXT_PUBLIC_SITE_URL`: Site URL for domain configuration

### CSP Configuration
Content Security Policy in `next.config.mjs` allows:
- Plausible domain: `*.cloudflareinsights.com`
- Umami domain: `umami.iocloudhost.net`

## Error Handling

1. Script Loading Errors:
   - Logged with error details
   - Doesn't affect page functionality
   - Retries on next route change

2. Tracking Errors:
   - Caught and logged
   - Events queued for retry
   - Maximum retry attempts configurable

## Debug Logging

Debug logs provide visibility into:
- Script load status
- Event tracking attempts
- Queue processing
- Error details

Example:
```typescript
console.debug('[Analytics Debug] Script status:', {
  umamiLoaded: true,
  plausibleLoaded: true,
  path: '/home'
})
```

## Testing Strategy

### Unit Tests
- Analytics Component:
  - Script loading behavior
  - Event tracking logic
  - Error handling
  - Environment variable handling

### Integration Tests
- Queue System:
  - Event persistence
  - Retry mechanism
  - Batch processing
  - Session handling

### Test Environment Setup
- Mock analytics providers
- Simulate script loading states
- Test queue processing
- Verify event data integrity

Example test setup:
```typescript
// Mock analytics providers
window.plausible = jest.fn();
window.umami = {
  track: jest.fn(),
};

// Test event tracking
render(<Analytics />);
await waitFor(() => {
  expect(window.plausible).toHaveBeenCalledWith(
    'pageview',
    expect.objectContaining({ path: '/test' })
  );
});
```

## Related Files

- [`components/analytics/Analytics.tsx`](../components/analytics/Analytics.tsx)
- [`lib/analytics/queue.ts`](../lib/analytics/queue.ts)
- [`types/analytics.ts`](../types/analytics.ts)
- [`types/env.d.ts`](../types/env.d.ts)
- [`public/scripts/plausible-init.js`](../public/scripts/plausible-init.js)
- [`next.config.mjs`](../next.config.mjs) (CSP configuration)
- [`__tests__/components/analytics/Analytics.test.tsx`](../__tests__/components/analytics/Analytics.test.tsx)
