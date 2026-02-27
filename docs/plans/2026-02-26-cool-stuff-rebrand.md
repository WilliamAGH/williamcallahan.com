# Cool Stuff Rebrand — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebrand bookmarks to "Cool Stuff" with a magazine-style discovery feed ranked by engagement signals, enriched cards, and vector-upgraded related content.

**Architecture:** Engagement events (impression, click, dwell, external_click) flow from client → `POST /api/engagement` → `content_engagement` table → materialized `content_discovery_scores` view → discovery feed ranking. The feed toggle (Discover/Latest) lives in the BookmarksWindow title bar as a segmented control. The related content system gets vector cosine similarity wired in via the existing `content_embeddings` table. UI-facing names change to "Cool Stuff"; all internal code stays "bookmarks".

**Tech Stack:** Next.js 16, React 19, Drizzle ORM, PostgreSQL (pgvector), Tailwind CSS, Vitest, Zod v4

**Design Doc:** `docs/plans/2026-02-26-cool-stuff-rebrand-design.md`

**Prerequisite Plan:** `docs/plans/2026-02-26-embedding-similarity-upgrade-design.md` (Phase 4 overlap — vector-based related content)

---

## Phase 1: Engagement Tracking Infrastructure

### Task 1: Create `content_engagement` Drizzle schema

**Files:**

- Create: `src/lib/db/schema/content-engagement.ts`

**Step 1: Write the schema file**

Follow the pattern in `src/lib/db/schema/bookmarks.ts` and `src/lib/db/schema/content-embeddings.ts`. Use Drizzle's `pgTable` with proper indexes.

```typescript
import { bigserial, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const ENGAGEMENT_EVENT_TYPES = ["impression", "click", "dwell", "external_click"] as const;
export type EngagementEventType = (typeof ENGAGEMENT_EVENT_TYPES)[number];

export const ENGAGEMENT_CONTENT_TYPES = [
  "bookmark",
  "blog",
  "book",
  "investment",
  "project",
  "thought",
] as const;
export type EngagementContentType = (typeof ENGAGEMENT_CONTENT_TYPES)[number];

export const contentEngagement = pgTable(
  "content_engagement",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    contentType: text("content_type").$type<EngagementContentType>().notNull(),
    contentId: text("content_id").notNull(),
    eventType: text("event_type").$type<EngagementEventType>().notNull(),
    durationMs: integer("duration_ms"),
    visitorHash: text("visitor_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_engagement_content").on(table.contentType, table.contentId),
    index("idx_engagement_scoring").on(table.contentType, table.eventType, table.createdAt),
    index("idx_engagement_visitor").on(table.visitorHash, table.createdAt),
  ],
);
```

**Step 2: Generate and run migration**

```bash
bun run drizzle-kit generate
```

Review the generated SQL in `drizzle/`. Then apply:

```bash
# Use Node runtime for DB connection per [RT1]
node drizzle/migrate.mjs
```

Or if migrations are applied via a different mechanism in this project, follow that pattern — check `package.json` for migration scripts.

**Step 3: Commit**

```bash
git add src/lib/db/schema/content-engagement.ts drizzle/
git commit -m "feat: add content_engagement table schema for engagement tracking"
```

---

### Task 2: Create Zod validation schema for engagement events

**Files:**

- Create: `src/types/schemas/engagement.ts`

**Step 1: Write the Zod schema**

```typescript
import { z } from "zod/v4";
import {
  ENGAGEMENT_CONTENT_TYPES,
  ENGAGEMENT_EVENT_TYPES,
} from "@/lib/db/schema/content-engagement";

export const engagementEventSchema = z.object({
  contentType: z.enum(ENGAGEMENT_CONTENT_TYPES),
  contentId: z.string().min(1).max(500),
  eventType: z.enum(ENGAGEMENT_EVENT_TYPES),
  durationMs: z.number().int().min(0).max(3_600_000).optional(),
});

export const engagementBatchSchema = z.object({
  events: z.array(engagementEventSchema).min(1).max(100),
});

export type EngagementEvent = z.infer<typeof engagementEventSchema>;
export type EngagementBatch = z.infer<typeof engagementBatchSchema>;
```

**Step 2: Commit**

```bash
git add src/types/schemas/engagement.ts
git commit -m "feat: add Zod schemas for engagement event validation"
```

---

### Task 3: Create engagement API route

**Files:**

- Create: `src/app/api/engagement/route.ts`

**Step 1: Write the API route**

Follow the pattern in `src/app/api/bookmarks/route.ts`. Accept batched events via POST. Compute `visitor_hash` server-side from IP + User-Agent (never trust client for this). Respect DNT header.

Key implementation points:

- Extract IP from `request.headers.get("x-forwarded-for")` or `request.headers.get("x-real-ip")`
- Extract UA from `request.headers.get("user-agent")`
- SHA-256 hash of `${ip}:${ua}` for `visitor_hash`
- Check `request.headers.get("dnt") === "1"` — if so, return 204 No Content (no tracking)
- Validate body with `engagementBatchSchema`
- Bulk insert into `content_engagement` via Drizzle
- Return 204 on success
- Rate limit: check count of events from same `visitor_hash` in last 60 seconds; reject if > 100

**Step 2: Write test**

- Test: `__tests__/api/engagement.test.ts`
- Test Zod validation rejects invalid events
- Test DNT header causes 204 with no DB write
- Test valid batch is accepted

**Step 3: Commit**

```bash
git add src/app/api/engagement/route.ts __tests__/api/engagement.test.ts
git commit -m "feat: add POST /api/engagement route for event tracking"
```

---

### Task 4: Create client-side engagement tracking hook

**Files:**

- Create: `src/hooks/use-engagement-tracker.ts`

**Step 1: Write the hook**

Naming pattern follows `src/hooks/use-pagination.ts`.

The hook provides:

- `trackImpression(contentType, contentId)` — called by IntersectionObserver when card is visible >= 1s
- `trackDwell(contentType, contentId)` — call on detail page mount; automatically sends elapsed time on `visibilitychange`/`pagehide`
- `trackExternalClick(contentType, contentId)` — call before external navigation

Implementation:

- Check `navigator.doNotTrack === "1"` on mount — if true, all functions are no-ops
- Impressions: accumulate in a `useRef<EngagementEvent[]>` array. Flush via `navigator.sendBeacon("/api/engagement", JSON.stringify({ events }))` every 30s (via `setInterval`) and on `visibilitychange` when `document.visibilityState === "hidden"`
- Dwell: record `performance.now()` on mount. On cleanup or visibility change, compute elapsed `durationMs` and send single event via `sendBeacon`
- External click: send immediately via `sendBeacon` (user is navigating away)

**Step 2: Write test**

- Test: `__tests__/hooks/use-engagement-tracker.test.ts`
- Test DNT disables tracking
- Test impression batching accumulates events
- Test dwell computes duration correctly

**Step 3: Commit**

```bash
git add src/hooks/use-engagement-tracker.ts __tests__/hooks/use-engagement-tracker.test.ts
git commit -m "feat: add useEngagementTracker hook for client-side event collection"
```

---

### Task 5: Create impression observer component

**Files:**

- Create: `src/components/features/bookmarks/impression-tracker.client.tsx`

**Step 1: Write the component**

A thin wrapper that uses `IntersectionObserver` to detect when a card enters the viewport for >= 1 second, then calls `trackImpression`. Wraps each bookmark card in the feed.

```tsx
"use client";
import { useRef, useEffect } from "react";

interface ImpressionTrackerProps {
  contentType: string;
  contentId: string;
  onImpression: (contentType: string, contentId: string) => void;
  children: React.ReactNode;
}
```

Uses a `useRef` for the DOM element, an `IntersectionObserver` with `threshold: 0.5`, and a `setTimeout` of 1000ms that fires the impression if the element is still intersecting.

**Step 2: Commit**

```bash
git add src/components/features/bookmarks/impression-tracker.client.tsx
git commit -m "feat: add ImpressionTracker component for viewport-based engagement"
```

---

### Task 6: Wire engagement tracking into bookmark pages

**Files:**

- Modify: `src/components/features/bookmarks/bookmarks-with-pagination.client.tsx` (wrap cards in ImpressionTracker)
- Modify: `src/components/features/bookmarks/bookmark-detail.tsx` (add dwell + external click tracking)

**Step 1: Add impression tracking to feed**

In `bookmarks-with-pagination.client.tsx`, import `useEngagementTracker` and `ImpressionTracker`. Wrap each `<BookmarkCardClient>` in the grid (line ~287) with `<ImpressionTracker>`.

**Step 2: Add dwell tracking to detail page**

In `bookmark-detail.tsx`, import `useEngagementTracker`. Call `trackDwell("bookmark", bookmark.id)` in a `useEffect` on mount. Add `trackExternalClick` to the "Visit Site" button's `onClick`.

**Step 3: Run validation**

```bash
bun run validate
```

Expected: 0 errors, 0 warnings.

**Step 4: Commit**

```bash
git add src/components/features/bookmarks/bookmarks-with-pagination.client.tsx src/components/features/bookmarks/bookmark-detail.tsx
git commit -m "feat: wire engagement tracking into bookmark feed and detail pages"
```

---

## Phase 2: Discovery Feed Algorithm

### Task 7: Create discovery score query and aggregation

**Files:**

- Create: `src/lib/db/queries/discovery-scores.ts`

**Step 1: Write the scoring query**

This module exports functions to:

1. Aggregate raw engagement events into per-content scores
2. Compute the discovery score: `(ctr_score + dwell_score + external_score) * recency_factor * novelty_boost`

Use raw SQL via Drizzle's `sql` template tag rather than a materialized view (more portable, easier to refresh on-demand).

Key query:

```sql
WITH engagement_agg AS (
  SELECT
    content_id,
    content_type,
    COUNT(*) FILTER (WHERE event_type = 'impression') AS impressions,
    COUNT(*) FILTER (WHERE event_type = 'click') AS clicks,
    AVG(duration_ms) FILTER (WHERE event_type = 'dwell') AS avg_dwell_ms,
    COUNT(*) FILTER (WHERE event_type = 'external_click') AS external_clicks
  FROM content_engagement
  WHERE created_at > NOW() - INTERVAL '90 days'
  GROUP BY content_type, content_id
)
SELECT ...scoring formula...
```

Also export a `getDiscoveryRankedBookmarks(page, limit)` function that joins scores with the bookmarks table and returns ranked results.

**Step 2: Write test**

- Test: `__tests__/lib/db/queries/discovery-scores.test.ts`
- Test scoring formula with mock aggregation data
- Test cold start fallback (no engagement data → favorites + recency)

**Step 3: Commit**

```bash
git add src/lib/db/queries/discovery-scores.ts __tests__/lib/db/queries/discovery-scores.test.ts
git commit -m "feat: add discovery score computation from engagement data"
```

---

### Task 8: Add feed mode to bookmarks API

**Files:**

- Modify: `src/app/api/bookmarks/route.ts`

**Step 1: Add `feed` query parameter**

Add support for `?feed=discover` (default) and `?feed=latest` query parameter.

- `latest`: Current behavior unchanged (`ORDER BY date_bookmarked DESC`)
- `discover`: Use `getDiscoveryRankedBookmarks()` from Task 7. Apply diversity pass (don't cluster same AI category consecutively). Fall back to cold start ranking if insufficient engagement data.

The diversity pass: after scoring, iterate through results. If an item's AI category matches the previous 2 items, move it down. This uses the `category` field from `ai_analysis_latest`.

**Step 2: Write test**

- Test: Add test cases to existing bookmarks API tests (if they exist) or create `__tests__/api/bookmarks-feed.test.ts`
- Test `?feed=latest` returns chronological order
- Test `?feed=discover` returns scored order (mock engagement data)

**Step 3: Run validation**

```bash
bun run validate
```

**Step 4: Commit**

```bash
git add src/app/api/bookmarks/route.ts __tests__/api/bookmarks-feed.test.ts
git commit -m "feat: add discover/latest feed mode to bookmarks API"
```

---

## Phase 3: UI Rebrand (Text Only)

### Task 9: Update navigation link and page metadata

**Files:**

- Modify: `src/components/ui/navigation/navigation-links.ts:30` — change `name: "Bookmarks"` to `name: "Cool Stuff"`
- Modify: `data/metadata.ts:201-207` — change title to `` `Cool Stuff From the Web - ${SITE_NAME}` `` and update description

**Step 1: Update nav link**

In `navigation-links.ts` line 30, change:

```typescript
{ name: "Cool Stuff", path: "/bookmarks" },
```

**Step 2: Update metadata**

In `data/metadata.ts` lines 201-207:

```typescript
bookmarks: {
  title: `Cool Stuff From the Web - ${SITE_NAME}`,
  description:
    "A curated collection of noteworthy tools, articles, and resources from across the web — searchable, organized, and enriched with AI analysis.",
  dateCreated: "2025-02-10T12:42:00",
  dateModified: new Date().toISOString(),
} as CollectionPageMetadata,
```

**Step 3: Update TerminalContext copy**

In `src/components/ui/context-notes/terminal-context.client.tsx` lines 28-38, update the `bookmark` entry:

```typescript
bookmark: {
  what: "cool stuff I found on the web",
  why: [
    "The internet is full of incredible tools, ideas, and resources.",
    "I organize what I find to make it searchable and discoverable.",
  ],
  more: [
    "Everything here is enriched with AI analysis and connected via semantic search.",
    "I built this for myself first, then thought others might find it useful too.",
  ],
},
```

**Step 4: Run validation**

```bash
bun run validate
bun run build:only
```

**Step 5: Commit**

```bash
git add src/components/ui/navigation/navigation-links.ts data/metadata.ts src/components/ui/context-notes/terminal-context.client.tsx
git commit -m "feat: rebrand bookmarks to Cool Stuff in nav, metadata, and context copy"
```

---

## Phase 4: Magazine Layout — Feed Toggle & Hero Row

### Task 10: Add Discover/Latest segmented control to window title bar

**Files:**

- Modify: `src/components/features/bookmarks/bookmarks-window.client.tsx:91-103`
- Create: `src/components/features/bookmarks/feed-toggle.client.tsx`

**Step 1: Create FeedToggle component**

A small segmented control component:

```tsx
"use client";
interface FeedToggleProps {
  mode: "discover" | "latest";
  onChange: (mode: "discover" | "latest") => void;
}
```

Renders two buttons ("Discover" / "Latest") in a pill-shaped container. Active button has `bg-gray-200 dark:bg-gray-700` and inactive is transparent. Follows existing badge/chip styling patterns.

**Step 2: Wire into BookmarksWindow title bar**

In `bookmarks-window.client.tsx` line 101, between the title `<h1>` and `<TerminalSearchHint>`, add the `<FeedToggle>` component. The toggle reads/writes the `?feed=` URL query param via `useSearchParams()` and `router.replace()`.

Pass the feed mode down through props to the children (BookmarksPaginatedClient → BookmarksWithPagination).

**Step 3: Run validation**

```bash
bun run validate
```

**Step 4: Commit**

```bash
git add src/components/features/bookmarks/feed-toggle.client.tsx src/components/features/bookmarks/bookmarks-window.client.tsx
git commit -m "feat: add Discover/Latest feed toggle to bookmarks window title bar"
```

---

### Task 11: Create category ribbon component

**Files:**

- Create: `src/components/features/bookmarks/category-ribbon.client.tsx`
- Create: `src/app/api/bookmarks/categories/route.ts`

**Step 1: Create categories API route**

Query `ai_analysis_latest` for distinct `payload->>'category'` values where `domain = 'bookmarks'`, grouped and counted, ordered by count DESC, limit 12.

Return: `{ categories: Array<{ name: string; count: number }> }`

**Step 2: Create CategoryRibbon component**

Horizontal scrollable strip of category chips. "All" is the default (no filter). Clicking a category updates the feed filter. Styling follows the existing tag chip pattern (`rounded-full px-3 py-1 text-xs font-medium`) but uses a distinct color scheme to differentiate from raw tags.

**Step 3: Wire into BookmarksWithPagination**

In `bookmarks-with-pagination.client.tsx`, add `<CategoryRibbon>` above the existing `<TagsList>`. The category ribbon becomes the primary filter; TagsList remains as a secondary filter below it (or hidden behind a "More filters" toggle).

**Step 4: Run validation**

```bash
bun run validate
```

**Step 5: Commit**

```bash
git add src/components/features/bookmarks/category-ribbon.client.tsx src/app/api/bookmarks/categories/route.ts src/components/features/bookmarks/bookmarks-with-pagination.client.tsx
git commit -m "feat: add AI category ribbon for content filtering"
```

---

### Task 12: Create hero row for Discover mode

**Files:**

- Create: `src/components/features/bookmarks/hero-row.client.tsx`
- Modify: `src/components/features/bookmarks/bookmark-card.client.tsx` (add `variant` prop)

**Step 1: Add `variant` prop to BookmarkCardClient**

Add an optional `variant?: "default" | "hero"` prop to `BookmarkCardClientProps`. When `variant === "hero"`:

- Description shows `line-clamp-4-resilient` (already default, but confirm)
- Show personal `note` preview if present (2-line clamp, blue-tinted background)
- Show `readingTime` in the meta row (add new optional prop `readingTime?: number`)
- Show AI `category` chip above the title (add new optional prop `category?: string`)
- Show favorite indicator when `isFavorite` (add new optional prop `isFavorite?: boolean`)

For `variant === "default"` (standard cards), also add:

- `readingTime` display next to date (e.g., "· 5 min read")
- `category` chip above title (small, subtle)
- `isFavorite` subtle star icon

These enrichments apply to ALL cards, not just hero. The hero variant just gets the note preview and larger treatment.

**Step 2: Create HeroRow component**

Renders the top 3 discovery-ranked bookmarks in an asymmetric grid:

```
grid-cols-3:
  col-span-2 → featured card (hero variant)
  col-span-1 → grid-rows-2 → two standard cards stacked
```

Only renders when `feedMode === "discover"` and bookmarks are available.

**Step 3: Wire into BookmarksWithPagination**

Add `<HeroRow>` above the main grid, passing the first 3 bookmarks. Remove those 3 from the main grid to avoid duplication.

**Step 4: Run validation and visual check**

```bash
bun run validate
bun run build:only
```

**Step 5: Commit**

```bash
git add src/components/features/bookmarks/hero-row.client.tsx src/components/features/bookmarks/bookmark-card.client.tsx src/components/features/bookmarks/bookmarks-with-pagination.client.tsx
git commit -m "feat: add hero row and enriched cards for magazine-style feed"
```

---

### Task 13: Add thematic section breaks

**Files:**

- Create: `src/components/features/bookmarks/section-break.client.tsx`
- Modify: `src/components/features/bookmarks/bookmarks-with-pagination.client.tsx`

**Step 1: Create SectionBreak component**

Simple divider with a category label:

```tsx
interface SectionBreakProps {
  category: string;
}
```

Renders:

```html
<div class="flex items-center gap-4 my-8 px-2">
  <div class="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
  <span class="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
    More about {category}
  </span>
  <div class="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
</div>
```

**Step 2: Insert into feed grid**

In `bookmarks-with-pagination.client.tsx`, when `feedMode === "discover"`, insert a `<SectionBreak>` every 8 items. Determine the label by looking at the dominant AI category of the next batch of items. This requires the API to return `category` per bookmark (from `ai_analysis_latest`).

**Step 3: Commit**

```bash
git add src/components/features/bookmarks/section-break.client.tsx src/components/features/bookmarks/bookmarks-with-pagination.client.tsx
git commit -m "feat: add thematic section breaks between feed clusters"
```

---

### Task 14: Enable infinite scroll in Discover mode

**Files:**

- Modify: `src/components/features/bookmarks/bookmarks-client-with-window.tsx:93`

**Step 1: Make infinite scroll conditional on feed mode**

Change line 93 from `enableInfiniteScroll={false}` to:

```typescript
enableInfiniteScroll={feedMode === "discover"}
```

Where `feedMode` is derived from the URL `?feed=` parameter passed down from the window component.

In Latest mode, keep the existing URL-based pagination behavior.

**Step 2: Run validation**

```bash
bun run validate
```

**Step 3: Commit**

```bash
git add src/components/features/bookmarks/bookmarks-client-with-window.tsx
git commit -m "feat: enable infinite scroll in Discover feed mode"
```

---

## Phase 5: Related Content Vector Upgrade

### Task 15: Wire content_embeddings into content graph build

**Files:**

- Modify: `src/lib/content-graph/build.ts:183-197`
- Create: `src/lib/db/queries/embedding-similarity.ts`

**Step 1: Create embedding similarity query function**

New module that queries `content_embeddings` for nearest neighbors:

```typescript
export async function findSimilarByEmbedding(
  domain: ContentEmbeddingDomain,
  entityId: string,
  limit: number = 30,
): Promise<Array<{ domain: string; entityId: string; title: string; similarity: number }>>;
```

Implementation:

1. Fetch the source item's embedding from `content_embeddings`
2. Query nearest neighbors: `1.0 - (qwen_4b_fp16_embedding <=> source_embedding)` ordered by distance, excluding self
3. Return top `limit` results

This is the pattern from the embedding similarity upgrade design doc (Phase 4, Layer 5).

**Step 2: Update `buildContentGraph` to use vector similarity**

In `src/lib/content-graph/build.ts`, replace the `findMostSimilar()` call at line 187 with `findSimilarByEmbedding()`. Apply blended scoring:

| Signal                                                               | Weight |
| -------------------------------------------------------------------- | ------ |
| Cosine similarity (from pgvector)                                    | 0.70   |
| Recency boost                                                        | 0.10   |
| Domain diversity bonus                                               | 0.10   |
| Content quality proxy (has description, is favorite, word count > 0) | 0.10   |

Fall back to existing heuristic `findMostSimilar()` for items without embeddings in `content_embeddings`.

**Step 3: Write test**

- Test: `__tests__/lib/db/queries/embedding-similarity.test.ts`
- Test that the query correctly excludes self
- Test blended scoring formula
- Test fallback when embedding is missing

**Step 4: Run full validation**

```bash
bun run validate
bun run test
```

**Step 5: Commit**

```bash
git add src/lib/db/queries/embedding-similarity.ts src/lib/content-graph/build.ts __tests__/lib/db/queries/embedding-similarity.test.ts
git commit -m "feat: wire content_embeddings into content graph for vector-based related content"
```

---

## Phase 6: Integration Testing & Cleanup

### Task 16: End-to-end validation

**Step 1: Run full validation suite**

```bash
bun run validate
bun run type-check
bun run build:only
bun run test
```

All must pass with 0 errors, 0 warnings.

**Step 2: Manual visual check**

```bash
bun run dev
```

Verify:

- [ ] Navigation shows "Cool Stuff" (not "Bookmarks")
- [ ] Page title is "Cool Stuff From the Web - William Callahan"
- [ ] Window toolbar shows `~/bookmarks`
- [ ] TerminalContext "What is this?" shows updated copy
- [ ] Feed toggle (Discover/Latest) appears in title bar
- [ ] Category ribbon renders with AI categories
- [ ] Hero row shows in Discover mode, hides in Latest mode
- [ ] Cards show AI category chip, reading time, favorite star
- [ ] Section breaks appear every ~8 items in Discover mode
- [ ] Latest mode is pure chronological (current behavior)
- [ ] Infinite scroll works in Discover mode
- [ ] Pagination works in Latest mode
- [ ] Detail pages still render correctly with RelatedContent
- [ ] Terminal search (⌘K) still works

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes for Cool Stuff rebrand"
```

---

### Task 17: Update documentation

**Files:**

- Modify: `docs/architecture/README.md` — add content_engagement table, discovery feed
- Modify: `docs/file-map.md` — add new files created
- Modify: `docs/features/bookmarks.md` — update for Cool Stuff rebrand, engagement tracking, feed modes

**Step 1: Update docs**

Add entries for:

- `src/lib/db/schema/content-engagement.ts` — engagement tracking schema
- `src/app/api/engagement/route.ts` — engagement event ingestion
- `src/hooks/use-engagement-tracker.ts` — client-side event collection
- `src/lib/db/queries/discovery-scores.ts` — feed ranking algorithm
- `src/lib/db/queries/embedding-similarity.ts` — vector-based related content
- `src/components/features/bookmarks/feed-toggle.client.tsx` — Discover/Latest toggle
- `src/components/features/bookmarks/category-ribbon.client.tsx` — AI category filter
- `src/components/features/bookmarks/hero-row.client.tsx` — featured content row
- `src/components/features/bookmarks/section-break.client.tsx` — thematic dividers
- `src/components/features/bookmarks/impression-tracker.client.tsx` — viewport tracking

**Step 2: Commit**

```bash
git add docs/
git commit -m "docs: update architecture and file map for Cool Stuff rebrand"
```

---

## Summary of New Files

| File                                                              | Purpose                                         |
| ----------------------------------------------------------------- | ----------------------------------------------- |
| `src/lib/db/schema/content-engagement.ts`                         | Drizzle schema for engagement tracking          |
| `src/types/schemas/engagement.ts`                                 | Zod validation for engagement events            |
| `src/app/api/engagement/route.ts`                                 | POST endpoint for event ingestion               |
| `src/hooks/use-engagement-tracker.ts`                             | Client-side tracking (impression, dwell, click) |
| `src/components/features/bookmarks/impression-tracker.client.tsx` | IntersectionObserver wrapper                    |
| `src/lib/db/queries/discovery-scores.ts`                          | Feed ranking computation                        |
| `src/components/features/bookmarks/feed-toggle.client.tsx`        | Discover/Latest segmented control               |
| `src/app/api/bookmarks/categories/route.ts`                       | AI category aggregation endpoint                |
| `src/components/features/bookmarks/category-ribbon.client.tsx`    | Category filter chips                           |
| `src/components/features/bookmarks/hero-row.client.tsx`           | Featured content 2/3 + 1/3 grid                 |
| `src/components/features/bookmarks/section-break.client.tsx`      | Thematic divider                                |
| `src/lib/db/queries/embedding-similarity.ts`                      | Vector cosine similarity queries                |

## Summary of Modified Files

| File                                                                     | Change                                                             |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `src/components/ui/navigation/navigation-links.ts:30`                    | "Bookmarks" → "Cool Stuff"                                         |
| `data/metadata.ts:201-207`                                               | Updated title + description                                        |
| `src/components/ui/context-notes/terminal-context.client.tsx:28-38`      | Updated copy                                                       |
| `src/app/api/bookmarks/route.ts`                                         | Add `?feed=` parameter                                             |
| `src/components/features/bookmarks/bookmarks-window.client.tsx`          | Add FeedToggle to title bar                                        |
| `src/components/features/bookmarks/bookmarks-with-pagination.client.tsx` | Add category ribbon, hero row, section breaks, impression tracking |
| `src/components/features/bookmarks/bookmarks-client-with-window.tsx:93`  | Conditional infinite scroll                                        |
| `src/components/features/bookmarks/bookmark-card.client.tsx`             | Add variant, category, readingTime, isFavorite props               |
| `src/components/features/bookmarks/bookmark-detail.tsx`                  | Add dwell + external click tracking                                |
| `src/lib/content-graph/build.ts:183-197`                                 | Replace heuristic with vector similarity                           |
