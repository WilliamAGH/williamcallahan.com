---
description: "Centralised asynchronous operations monitoring & background task orchestration"
alwaysApply: false
---

# Instrumentation & Async Operations Monitoring

## Core Objective

Provide a lightweight, **server-only** mechanism to register, time, and surface status for any long-running Promise in the application.  The goals are:

1. Prevent hidden blocking calls from delaying server startup.
2. Surface time-outs / failures quickly to Sentry or logs.
3. Offer a single source of truth for background processes (preloaders, cron-like jobs).

## Key Files

| Path | Purpose |
|------|---------|
| `lib/async-operations-monitor.ts` | Singleton monitor (`asyncMonitor`) plus helpers `monitoredAsync` & `nonBlockingAsync`. |
| `lib/server/bookmarks-preloader.ts` | Wraps bookmark warm-up in `monitoredAsync`. |
| `instrumentation.ts` | Registers Sentry, raises `scheduleBackgroundBookmarkPreload`, and configures Node listeners. |

## Logic Flow Diagram

See `instrumentation-monitoring.mmd` for the sequence diagram illustrating the async monitoring flow.

## Critical Issues & Gotchas

1. **Edge Runtime**: The monitor relies on `setImmediate` & Node timers; guard all imports with `process.env.NEXT_RUNTIME === 'nodejs'` when adding new consumers.
2. **Memory Growth**: Completed operations are pruned every 30 s in development.  In production, we should add a similar job or TTL to avoid unbounded Map growth.
3. **MaxListenersExceededWarning**: `instrumentation.ts` raises `EventEmitter.defaultMaxListeners` to 25 to accommodate concurrent bookmark fetches; revisit if other tasks push this higher.
4. **Time-out Semantics**: A timed-out operation is not automatically aborted.  Tasks should implement their own abort signal if required.

## Related Functionality

* `bookmarks` – depends on the monitor for safe warming.
* `image-handling` – may adopt for bulk logo processing in future.

## Future Enhancements

* Expose `/api/monitor` debug route that returns `asyncMonitor.getSummary()` for ops insight.
* Push metrics to Prometheus via OpenTelemetry once infra is ready.
