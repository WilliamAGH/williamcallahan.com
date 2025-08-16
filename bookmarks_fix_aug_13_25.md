## Bookmarks Reliability Plan (Aug 13, 2025)

A DRY, idempotent, and observable refresh pipeline for bookmarks that works the same from both the scheduler/cron and manual refreshes. No new dependencies.

### Goals
- Ensure refresh runs reliably every 2 hours (scheduler) and on demand (API) using the same code path.
- Persist freshness metadata on every successful run (even when data is unchanged).
- Persist heavy JSON artifacts only when the dataset actually changes.
- Eliminate (or strongly mitigate) races across instances, without introducing new folders.
- Avoid silent skips due to memory pressure for the minimal index metadata.
- Harden S3-compatible client/env handling to avoid non-obvious read-only behavior.
- Add low-cost observability to detect issues early.

### Current behavior (verified)
- Scheduler: `bun lib/server/scheduler.ts` runs every 2h (+ up to 15m jitter) and spawns `bun run update-s3 -- --bookmarks`.
- Updater CLI: `scripts/data-updater.ts` calls `DataFetchManager.fetchData({ bookmarks: true, ... })`.
- Data fetch path: `DataFetchManager.fetchBookmarks()` → `refreshBookmarks(force)` → `bookmarks-data-access.server.ts` → S3 writes gated by `hasBookmarksChanged()`.
- S3 write skips: JSON writes are skipped under memory pressure; lock acquisition not actually atomic; index freshness does not advance if no change detected.

---

## Phase 1 — Low-risk hotfixes (freshness + DRY path)

- [ ] Update `lib/bookmarks/bookmarks-data-access.server.ts` to write freshness metadata on every successful run:
  - [ ] Always write `index.json` with at least: `lastAttemptedAt` (now) and on success also `lastFetchedAt` (now) even when the dataset is unchanged.
  - [ ] Keep "heavy" writes (`bookmarks.json`, `pages*/page-*.json`, `tags*/page-*.json`) gated by `hasBookmarksChanged()` to avoid unnecessary churn.
  - [ ] Include a `changeDetected: boolean` in `index.json` for transparency.

- [ ] Normalize types for `lastFetchedAt`/`lastAttemptedAt` (number vs ISO):
  - [ ] Use numeric epoch milliseconds consistently in `index.json`.
  - [ ] Audit readers (e.g., `/app/api/bookmarks/route.ts`, `/app/api/bookmarks/refresh/route.ts`) to treat the field as number and avoid extra `Date()` parsing.

- [ ] Unify manual refresh and scheduler into a single DRY entrypoint:
  - [ ] Reuse existing `DataFetchManager.fetchData({ bookmarks: true, ... })` to run the refresh; expose a tiny helper (or direct call) to avoid duplicating logic.
  - [ ] Update `/app/api/bookmarks/refresh/route.ts` to call the same path with `{ force: isCronJob }`.
  - [ ] Ensure `scripts/data-updater.ts` continues to call the same manager entrypoint (it already does); verify parity of parameters used by API and scheduler.

- [ ] Ensure freshness headers in `/app/api/bookmarks/route.ts` remain correct and reflect `index.json`:
  - [ ] When serving paginated pages from S3, set `meta.dataVersion` to `index.lastFetchedAt` (number) and keep `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.

- [ ] Add a tiny, always-on heartbeat S3 write (no new deps) after each run:
  - [ ] Write `json/bookmarks/heartbeat.json` (reuses existing `json/bookmarks/` directory) with `{ runAt: now, success: boolean, changeDetected: boolean }`.
  - [ ] Add a constant `BOOKMARKS_S3_PATHS.HEARTBEAT` (env-suffixed) so all reads/writes continue to use a single source of truth for paths.

---

## Phase 2 — Single-key lock robustness (no new folders, no new deps)

- [ ] Keep a single lock file at `BOOKMARKS_S3_PATHS.LOCK` (already `json/bookmarks/refresh-lock{envSuffix}.json`).
- [ ] Robust acquire algorithm (best-effort without provider-specific features):
  - [ ] Step A: HEAD the lock file; if present and not expired (TTL), bail.
  - [ ] Step B: If expired or missing, PUT a new lock file containing `{ instanceId, acquiredAt, ttlMs }`.
  - [ ] Step C: Immediately READ the lock file back; proceed only if `instanceId` matches (last-writer-wins check) and `acquiredAt` is ours.
  - [ ] Step D: If mismatch, another process won; back off with jitter and exit.
  - [ ] Step E: On completion or error, DELETE the lock (ignore 404).
- [ ] Periodic cleanup: keep the existing cleanup timer to remove stale locks when TTL exceeded.
- [ ] Remove reliance on conditional headers for PUT (unsupported across many S3-compatible providers).

Rationale: This preserves the simplest battle-tested structure (one file, one path), avoids folder proliferation, and still provides strong practical coordination for a single-scheduler deployment (with acceptable behavior under rare races).

---

## Phase 3 — JSON write resilience (index is cheap, never skip)

- [ ] Adjust `lib/s3-utils.ts` JSON writing behavior:
  - [ ] For `index.json` and `heartbeat.json`, bypass the memory-headroom skip (these files are tiny) or lower the threshold so they are always written.
  - [ ] Keep headroom checks for large payloads only (e.g., `bookmarks.json`, images).

- [ ] Add structured logs when a large write is skipped due to memory, including key name and size.

---

## Phase 4 — Environment hardening (S3-compatible client)

- [ ] Allow SDK default endpoint when no custom endpoint is provided:
  - [ ] In `lib/s3-utils.ts#getS3Client()`, make `endpoint` optional; if absent, construct the client with `region` and credentials only (SDK default resolution).
  - [ ] Log an explicit warning if neither a custom endpoint nor a usable region is present.

- [ ] Validate credentials on process start and log a clear one-liner state summary (bucket, endpoint present/missing) — neutral wording (S3-compatible provider).

- [ ] Confirm that `process.env.IS_DATA_UPDATER = "true"` is set by both CLI and scheduler path (already in `scripts/data-updater.ts` line 18).

---

## Phase 5 — DRY behavior parity for API and scheduler

- [ ] Ensure `/app/api/bookmarks/refresh/route.ts` and `lib/server/scheduler.ts` both use the same orchestration (results contract identical):
  - [ ] Consistent `{ force, immediate }` behavior: scheduler may set `{ force: true, immediate: false }` by default; manual non-cron refresh keeps `{ force: false }` unless secret present.
  - [ ] Return structure includes `success, itemsProcessed, changeDetected, lastFetchedAt`.

- [ ] Update `scripts/data-updater.ts` to:
  - [ ] Print the same structured result lines (already logs summaries; add `changeDetected` and `lastFetchedAt`).
  - [ ] Keep dev 12-hour skip logic; explicitly show skip reason for clarity.

---

## Phase 6 — Test plan (no new deps)

- [ ] Unit tests for `hasBookmarksChanged()` and index updates:
  - [ ] Unchanged dataset → heavy writes skipped, `index.lastFetchedAt` and `heartbeat` updated.
  - [ ] Changed dataset → heavy writes happen, index updated accordingly.

- [ ] Concurrency tests (mock S3-compatible):
  - [ ] Two simulated processes contend for the single lock → only the process that reads back its own `instanceId` proceeds; the other backs off.

- [ ] Env matrix smoke tests:
  - [ ] With custom endpoint (e.g., Spaces/R2/MinIO) and without (SDK default endpoint), both paths initialize and perform JSON writes.

- [ ] Memory skip coverage:
  - [ ] Large payload write under mocked low-memory → skip with log; `index.json` still written.

---

## Phase 7 — Observability & Ops

- [ ] Document and expose freshness:
  - [ ] `/api/bookmarks/refresh` GET returns `needsRefresh` computed from `index.lastFetchedAt` (numeric) and also returns `lastAttemptedAt` and `changeDetected`.

- [ ] Make scheduler logs high-signal:
  - [ ] On every run, log: start, `instanceId`, result, `changeDetected`, and `lastFetchedAt`.

- [ ] S3 visibility:
  - [ ] Heartbeat object visible at `json/bookmarks/heartbeat.json` for quick operational checks (no new folder, reuses existing directory).

---

## File-level edit checklist

- [ ] `lib/bookmarks/bookmarks-data-access.server.ts`
  - [ ] Always update `index.json` freshness on successful runs.
  - [ ] Add `changeDetected` flag to `index.json`.
  - [ ] Keep single lock file path `BOOKMARKS_S3_PATHS.LOCK`; implement the read-back verification algorithm.
  - [ ] Remove conditional write reliance; document provider-consistency notes.
  - [ ] Add `BOOKMARKS_S3_PATHS.HEARTBEAT` constant and use it for heartbeat writes.

- [ ] `lib/s3-utils.ts`
  - [ ] Treat tiny JSON (`index.json`, `heartbeat.json`) as always-safe writes; keep headroom checks for large payloads.
  - [ ] Make `endpoint` optional in `getS3Client()` to support SDK default endpoint.
  - [ ] Add structured logs when large writes are skipped due to memory pressure.

- [ ] `lib/server/data-fetch-manager.ts`
  - [ ] Reuse existing code paths (no duplication) to run the refresh; expose a small helper or direct call for API and scheduler.
  - [ ] Return a normalized result object including `changeDetected` and `lastFetchedAt`.

- [ ] `/app/api/bookmarks/refresh/route.ts`
  - [ ] Use the unified refresh function; include structured response with `lastFetchedAt`, `changeDetected`.
  - [ ] GET path returns numeric timestamps.

- [ ] `/app/api/bookmarks/route.ts`
  - [ ] Ensure `meta.dataVersion` uses numeric `lastFetchedAt`.

- [ ] `lib/server/scheduler.ts`
  - [ ] No logic change required; ensure logs include `instanceId` and result fields.

- [ ] `scripts/data-updater.ts` (referenced by `package.json` scripts)
  - [ ] Continue to set `IS_DATA_UPDATER=true`.
  - [ ] Print unified result summaries (include `changeDetected`, `lastFetchedAt`).

---

## Rollout steps

- [ ] Implement Phase 1 and Phase 3 (safe and low-risk) → deploy.
- [ ] Observe heartbeats and `index.json` advancing every 2h; confirm API freshness.
- [ ] Implement Phase 2 lock read-back verification and Phase 4 client endpoint behavior → deploy.
- [ ] Run Phase 5 parity checks and Phase 6 test suite.
- [ ] Monitor for 48–72 hours. If stable, close issue.

---

## Final audit of this plan

- No new folders introduced:
  - Lock remains a single file `BOOKMARKS_S3_PATHS.LOCK` under `json/bookmarks/`.
  - Heartbeat uses `json/bookmarks/heartbeat.json` (or `BOOKMARKS_S3_PATHS.HEARTBEAT`), both overwrite in place.

- Neutral, provider-agnostic language:
  - We refer to an S3-compatible provider and the JavaScript SDK; no provider-specific guarantees assumed.
  - For consistency, we use a read-back verification instead of provider-specific conditional headers.

- DRY usage of existing code:
  - Both scheduler and manual API use `DataFetchManager.fetchData({ bookmarks: true })` (or a minimal helper calling it). No duplicated refresh logic.
  - We do not add parallel refresh paths; `refreshBookmarks` and `bookmarks-data-access` remain the single source of truth for persistence.

- Safety and resilience:
  - Freshness metadata always advances, but heavy writes only occur on dataset change.
  - Tiny JSON writes bypass memory-headroom skips to prevent false "stale" states.
  - Single-key lock with read-back verification minimizes races without complexity.
  - Environment handling supports both custom endpoints and SDK defaults.

- Test coverage and observability:
  - Tests cover unchanged/changed datasets, concurrency for single-key lock, environment variations, and memory-skip paths.
  - Heartbeat and structured logs make failures visible.

- Security and type safety:
  - No new environment variables required.
  - Types normalized for timestamps; API responses updated accordingly.

---

## References
- `package.json` scripts: `scheduler`, `update-s3`, `prefetch`, `reset:bookmarks`.
- Scheduler: `lib/server/scheduler.ts`.
- Updater CLI: `scripts/data-updater.ts`.
- Orchestrator: `lib/server/data-fetch-manager.ts`.
- Bookmarks data access: `lib/bookmarks/bookmarks-data-access.server.ts`.
- S3 utils: `lib/s3-utils.ts`.
- API routes: `/app/api/bookmarks/route.ts`, `/app/api/bookmarks/refresh/route.ts`.
