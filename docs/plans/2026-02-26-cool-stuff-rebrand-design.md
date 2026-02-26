# Cool Stuff Rebrand — Design Document

> **Date**: 2026-02-26
> **Status**: Approved
> **Scope**: UI rebrand + engagement tracking + discovery feed + related content vector upgrade

## Summary

Rebrand the bookmarks collection page from "Bookmarks" to "Cool Stuff" (nav) / "Cool Stuff From the Web" (page title). Transform the reverse-chronological list into a magazine-style discovery feed ranked by engagement signals, with a Latest toggle for chronological fallback. Upgrade the related content system to use vector embeddings as the primary relevance signal.

**Constraints:**

- Internal code stays as-is: all filenames, function names, class names, route paths (`/bookmarks`), and variables remain "bookmarks"
- Window toolbar stays `~/bookmarks`
- Container width stays `max-w-5xl mx-auto` (site-wide standard)
- TerminalContext "What is this?" stays prominently at top with updated copy
- All existing functionality (pagination, tag filtering, detail pages, AI analysis, terminal search) must survive intact

---

## 1. UI-Facing Name Changes

| Location                                | Current                                                            | New                                          |
| --------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------- |
| Navigation link (`navigation-links.ts`) | "Bookmarks"                                                        | "Cool Stuff"                                 |
| Page `<title>` (`data/metadata.ts`)     | "Bookmarks & Resources - William Callahan"                         | "Cool Stuff From the Web - William Callahan" |
| Meta description                        | "A live updating directory of things online I found noteworthy..." | Updated for discovery/curation angle         |
| TerminalContext copy                    | "a bookmark from my personal collection"                           | Updated for "cool stuff" framing             |
| Schema.org / OG metadata                | Updated title + description                                        | Same `CollectionPage` type                   |
| Window toolbar path                     | `~/bookmarks`                                                      | `~/bookmarks` (unchanged)                    |
| URL path                                | `/bookmarks`                                                       | `/bookmarks` (unchanged)                     |
| Internal code                           | All "bookmarks"                                                    | All "bookmarks" (unchanged)                  |

---

## 2. Engagement Tracking System

### 2.1 Database Schema

New table `content_engagement`:

| Column         | Type                                 | Notes                                            |
| -------------- | ------------------------------------ | ------------------------------------------------ |
| `id`           | `BIGSERIAL` PK                       |                                                  |
| `content_type` | `TEXT NOT NULL`                      | 'bookmark', 'blog', 'book', etc.                 |
| `content_id`   | `TEXT NOT NULL`                      | The entity id                                    |
| `event_type`   | `TEXT NOT NULL`                      | 'impression', 'click', 'dwell', 'external_click' |
| `duration_ms`  | `INTEGER`                            | Populated for 'dwell' events only                |
| `visitor_hash` | `TEXT NOT NULL`                      | SHA-256(IP + User-Agent), no PII                 |
| `created_at`   | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` |                                                  |

Indexes:

- `idx_engagement_content` on `(content_type, content_id)` — aggregation queries
- `idx_engagement_scoring` on `(content_type, event_type, created_at)` — time-windowed scoring

### 2.2 Client-Side Tracking Hook

New hook: `useEngagementTracker` in `src/hooks/use-engagement-tracker.ts`

**Events captured:**

| Event            | Trigger                           | Implementation                                                                |
| ---------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| `impression`     | Card visible in viewport >= 1s    | `IntersectionObserver`, threshold 0.5, 1s timer per card                      |
| `click`          | Navigate to detail page           | Server-side: log on detail page render (more reliable than client click)      |
| `dwell`          | Time spent on detail page         | `performance.now()` on mount, `sendBeacon()` on `visibilitychange`/`pagehide` |
| `external_click` | Click "Visit Site" / external URL | Client-side event before navigation                                           |

**Batching:** Impressions accumulate in an array, flushed via `navigator.sendBeacon()` to `POST /api/engagement` every 30s or on `visibilitychange`.

**Privacy:** No cookies, no fingerprinting, no PII. `visitor_hash` is irreversible. Respects `Do Not Track` header — if `navigator.doNotTrack === "1"`, no events recorded.

### 2.3 API Route

`POST /api/engagement` — accepts batched events, validates with Zod schema, bulk inserts to Postgres. No auth required (public page). Rate-limited by visitor_hash (max 100 events/minute).

---

## 3. Discovery Feed Algorithm

### 3.1 Materialized View

```sql
CREATE MATERIALIZED VIEW content_discovery_scores AS
SELECT
  content_id,
  content_type,
  COALESCE(clicks::float / NULLIF(impressions, 0), 0) * 2.0 AS ctr_score,
  COALESCE(avg_dwell_ms / 60000.0, 0) * 1.5 AS dwell_score,
  COALESCE(external_clicks, 0) * 3.0 AS external_score,
  EXP(-0.0077 * EXTRACT(EPOCH FROM (NOW() - last_bookmarked)) / 86400) AS recency_factor,
  CASE WHEN impressions < 10 THEN 2.0
       WHEN impressions < 50 THEN 1.5
       ELSE 1.0 END AS novelty_boost
FROM engagement_aggregates;
```

**Final ranking:** `discovery_score = (ctr_score + dwell_score + external_score) * recency_factor * novelty_boost`

### 3.2 Diversity Pass

After scoring, apply tag-graph diversity shuffle: if 3+ consecutive items share the same primary AI category (from `ai_analysis_latest`), interleave items from other categories. Uses existing tag co-occurrence data from `content_graph_artifacts`.

### 3.3 Cold Start

When engagement data is insufficient (< 100 total events), fall back to:

1. `is_favorite = true` items first
2. AI category diversity (round-robin across categories)
3. Recency (newest first within each group)

All cold-start data already exists in Postgres.

### 3.4 Feed Toggle

Two modes controlled by a segmented control in the window title bar:

- **Discover** (default): Ranked by `discovery_score` + diversity
- **Latest**: Pure `ORDER BY date_bookmarked DESC` (current behavior)

State persisted in URL query param: `?feed=discover` (default) / `?feed=latest`.

---

## 4. Page Layout — "The Broadsheet"

All within `max-w-5xl mx-auto` inside the existing BookmarksWindow component.

### 4.1 Page Structure (top to bottom)

1. **Sticky title bar**: WindowControls + `~/bookmarks` + `[Discover | Latest]` toggle + `⌘K` search hint
2. **TerminalContext**: `/* What is this? */` with updated "cool stuff" copy
3. **Category ribbon**: Horizontal scrollable chips of AI-derived categories
4. **Hero row** (Discover mode only): Asymmetric 2/3 + 1/3 layout
5. **Feed grid**: 2-column cards with thematic section breaks every ~8 items
6. **Infinite scroll**: Loads next page on scroll (currently disabled, enable in Discover mode)

### 4.2 Category Ribbon

Replaces current `TagsList` as the primary filter.

- Source: Distinct `payload->>'category'` values from `ai_analysis_latest` where `domain = 'bookmarks'`
- Display: Top ~10-12 categories by count, horizontal scrollable, `[All]` default
- Selecting a category filters the feed to matching bookmarks
- Raw tag filtering remains accessible within category views or via terminal search

### 4.3 Hero Row (Discover Mode Only)

Top 3 items by `discovery_score` displayed in an asymmetric grid:

```
┌────────────────────────┬───────────┐
│                        │ Secondary │
│   Featured (2/3)       ├───────────┤
│                        │ Secondary │
└────────────────────────┴───────────┘
```

- Featured card: Larger image, 4-line description, AI category, reading time, personal note preview (if exists)
- Secondary cards: Standard card size, stacked vertically
- CSS: `grid-cols-3` with featured at `col-span-2`, secondaries in `col-span-1` with `grid-rows-2`
- In Latest mode: hero row does not render

### 4.4 Feed Grid

- Standard 2-column grid (`grid-cols-1 md:grid-cols-2 gap-6`) — same as current
- In Discover mode: infinite scroll enabled
- In Latest mode: URL-based pagination (current behavior preserved)

### 4.5 Thematic Section Breaks

In Discover mode, every ~8 items, insert a divider:

```
─── More about AI & Machine Learning ───────────
```

- Label derived from the dominant AI category of the next cluster
- Lightweight `<div>` with horizontal rule and small-caps label
- Not rendered in Latest mode

---

## 5. Card Enrichment

Existing `BookmarkCardClient` enhanced with additional data (all already in Postgres):

| Addition              | Source                                | Display                          |
| --------------------- | ------------------------------------- | -------------------------------- |
| AI category chip      | `ai_analysis_latest.payload.category` | Small chip above title           |
| Reading time          | `bookmarks.reading_time`              | "5 min read" next to date        |
| Favorite indicator    | `bookmarks.is_favorite`               | Subtle star icon                 |
| Personal note preview | `bookmarks.note`                      | On hero cards only, 2-line clamp |

**Hero card variant**: Same component with a `variant="hero"` prop that:

- Renders 4-line description (vs 2-line)
- Shows personal note preview
- Uses larger image aspect ratio
- Gets wider grid span (parent handles layout)

---

## 6. Related Content Vector Upgrade

### 6.1 Current State

`calculateSimilarity()` in `src/lib/content-similarity/index.ts` uses heuristic signals:

- Tag Jaccard: 0.40
- Token overlap: 0.30
- Domain match: 0.20
- Recency: 0.10

No vector embeddings used despite 100% coverage on bookmarks.

### 6.2 New Weights

| Signal                   | New Weight | Old Weight |
| ------------------------ | ---------- | ---------- |
| Vector cosine similarity | 0.50       | 0.00       |
| Tag Jaccard              | 0.20       | 0.40       |
| Token overlap            | 0.10       | 0.30       |
| Domain match             | 0.10       | 0.20       |
| Recency                  | 0.10       | 0.10       |

### 6.3 Implementation

- Add embedding lookup for source item in the similarity calculation
- Compute `1 - (embedding <=> other_embedding)` for each candidate
- For cross-content-type similarity: use vector scores only when both items have embeddings; fall back to heuristic-only weights when embedding is missing
- Rebuild `content_graph_artifacts` with vector scores incorporated
- Detail page load time unchanged (pre-computed artifacts)

---

## 7. Data Flow Summary

```
User visits /bookmarks
  → Server: fetch bookmarks + discovery scores + AI categories
  → Client: render feed (Discover or Latest based on toggle)
  → Client: IntersectionObserver tracks impressions
  → User clicks card → detail page
  → Server: log click event, render detail page with vector-upgraded RelatedContent
  → Client: track dwell time
  → User clicks "Visit Site" → log external_click
  → Engagement data → content_engagement table
  → Periodic: refresh materialized view → updated discovery_scores
  → Next visit: feed ranking reflects engagement signals
```

---

## 8. What Does NOT Change

- All internal code identifiers (filenames, functions, classes, variables)
- Route path (`/bookmarks`, `/bookmarks/[slug]`, `/bookmarks/tags/[...slug]`)
- Window toolbar path (`~/bookmarks`)
- Detail page structure and components
- Terminal search integration
- Tag page functionality
- Pagination in Latest mode
- AI analysis on-demand generation
- Bookmark data sync from Karakeep
