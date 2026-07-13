---
description: "Centralised asynchronous operations monitoring & background task orchestration"
alwaysApply: false
---

# Instrumentation & Async Operations Monitoring

## Core Objective

Provide a lightweight, **server-only** mechanism to register, time, and surface status for any long-running Promise in the application. The goals are:

1. Prevent hidden blocking calls from delaying server startup.
2. Surface time-outs / failures quickly to Sentry or logs.
3. Offer a single source of truth for background processes (preloaders, cron-like jobs).

## Key Files

| Path                                              | Purpose                                                                                                                           |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/async-operations-monitor.ts`             | Singleton monitor (`asyncMonitor`) plus helpers `monitoredAsync` and `nonBlockingAsync`.                                          |
| `src/lib/bookmarks/bookmarks-preloader.server.ts` | Defines the optional Node-only bookmark warm-up using `monitoredAsync`; instrumentation does not register it automatically.       |
| `src/instrumentation.ts`                          | Dispatches the Next.js hook to the Node or Edge implementation and redacts sensitive headers before Sentry request-error capture. |
| `src/instrumentation-node.ts`                     | Configures Node-only Sentry/startup work, including opt-in image-manifest warm-up and bookmark-data-access initialization.        |

## Logic Flow Diagram

See [monitoring.mmd](monitoring.mmd) for the sequence diagram illustrating the async monitoring flow.

## Critical Issues & Gotchas

1. **Edge Runtime**: `nonBlockingAsync` relies on `setImmediate`; use it only from Node-runtime consumers.
2. **Memory Growth**: The monitor clears completed operations every five minutes. In a long-lived Node runtime, an additional cleanup runs every 30 seconds in development or every minute in production, and the five-minute cleanup prunes the map when it exceeds 1,000 entries.
3. **MaxListenersExceededWarning**: `src/instrumentation-node.ts` raises `EventEmitter.defaultMaxListeners` to 25 to accommodate concurrent bookmark fetches; revisit if other tasks push this higher.
4. **Time-out Semantics**: A timed-out operation is not automatically aborted. Tasks should implement their own abort signal if required.

## Related Functionality

- `bookmarks` – depends on the monitor for safe warming.
- `image-handling` – may adopt for bulk logo processing in future.

## Future Enhancements

- Expose `/api/monitor` debug route that returns `asyncMonitor.getSummary()` for ops insight.
- Push metrics to Prometheus via OpenTelemetry once infra is ready.
