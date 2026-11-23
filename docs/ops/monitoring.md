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
| `src/lib/async-operations-monitor.ts`             | Singleton monitor (`asyncMonitor`) and the `monitoredAsync` timeout wrapper.                                                      |
| `src/lib/bookmarks/bookmarks-preloader.server.ts` | Defines the optional Node-only bookmark warm-up using `monitoredAsync`; instrumentation does not register it automatically.       |
| `src/instrumentation.ts`                          | Dispatches the Next.js hook to the Node or Edge implementation and redacts sensitive headers before Sentry request-error capture. |
| `src/instrumentation-node.ts`                     | Configures Node-only Sentry/startup work, including opt-in image-manifest warm-up and bookmark-data-access initialization.        |

## Development memory sampling

Each deployed Linux development web process emits `server_memory_sample` to stdout at startup, once per minute, and after natural major garbage collections at most once per minute. Sampling stops after 24 hours. Production, local development, and builds do not start the sampler.

Use the log collector’s task ID and service revision to compare samples from the same replica before, during, and after naturally occurring request bursts. All memory fields are in bytes. `arrayBuffers` is part of `external`; do not add them. `swapBytes` is process swap and is `null` when unavailable. For a major collection, `majorGcDelayMs` records the time between the collection ending and the asynchronous sample. Use samples with small delays to estimate the post-collection heap floor; they are not heap snapshots at the collection boundary.

## Logic Flow Diagram

See [monitoring.mmd](monitoring.mmd) for the sequence diagram illustrating the async monitoring flow.

## Critical Issues & Gotchas

1. **Timer Ownership**: Each `monitoredAsync` call owns its timeout handle and clears it on completion or failure; no separate monitor timeout registry is involved.
2. **Memory Growth**: The monitor clears completed operations every five minutes. In a long-lived Node runtime, an additional cleanup runs every 30 seconds in development or every minute in production, and the five-minute cleanup prunes the map when it exceeds 1,000 entries.
3. **MaxListenersExceededWarning**: `src/instrumentation-node.ts` raises `EventEmitter.defaultMaxListeners` to 25 to accommodate concurrent bookmark fetches; revisit if other tasks push this higher.
4. **Time-out Semantics**: A timed-out operation is not automatically aborted. Tasks should implement their own abort signal if required.

## Related Functionality

- `bookmarks` – depends on the monitor for safe warming.
- `image-handling` – may adopt for bulk logo processing in future.

## Future Enhancements

- Expose `/api/monitor` debug route that returns `asyncMonitor.getSummary()` for ops insight.
- Push metrics to Prometheus via OpenTelemetry once infra is ready.
