# Discover Page Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the narrow single-feed `/bookmarks` Discover page with a full-viewport, topic-organized layout where bookmarks are grouped by category, each section showing image-dominant compact cards ranked by discovery score.

**Architecture:** Server Component calls a new `getDiscoveryGroupedBookmarks()` DB query directly (no API hop) for full SSR/SEO. A thin client wrapper handles the sticky category ribbon's scroll-to-section behavior. The existing `BookmarksWithPagination` + `BookmarksServer` pipeline is preserved for Latest mode and "See all" filtered views.

**Tech Stack:** Next.js 16 (App Router, Server Components), Drizzle ORM (PostgreSQL), React 19, Tailwind CSS, Vitest

**Design doc:** `docs/plans/2026-02-27-discover-page-redesign.md`

---

## Task 1: Grouping Query — Pure Scoring Logic

Build the pure (non-DB) grouping function that takes scored bookmark rows and returns
topic sections. This is testable without mocking the database.

**Files:**

- Create: `src/lib/db/queries/discovery-grouped.ts`
- Test: `__tests__/lib/db/queries/discovery-grouped.test.ts`

**Step 1: Write the failing test**

```typescript
// __tests__/lib/db/queries/discovery-grouped.test.ts
import { groupByCategory, type ScoredBookmarkRow } from "@/lib/db/queries/discovery-grouped";

function makeScoredRow(
  id: string,
  category: string | null,
  discoveryScore: number,
  dateBookmarked: string,
): ScoredBookmarkRow {
  return {
    bookmark: {
      id,
      url: `https://example.com/${id}`,
      title: `Bookmark ${id}`,
      description: `Desc ${id}`,
      slug: `slug-${id}`,
      tags: [],
      dateBookmarked,
      domain: "example.com",
    },
    category,
    discoveryScore,
  };
}

describe("groupByCategory", () => {
  it("groups rows by category, sorted by topScore descending", () => {
    const rows: ScoredBookmarkRow[] = [
      makeScoredRow("1", "AI", 0.95, "2026-02-27T00:00:00Z"),
      makeScoredRow("2", "AI", 0.8, "2026-02-26T00:00:00Z"),
      makeScoredRow("3", "DevTools", 0.9, "2026-02-27T00:00:00Z"),
      makeScoredRow("4", "DevTools", 0.7, "2026-02-25T00:00:00Z"),
      makeScoredRow("5", "Cloud", 0.6, "2026-02-24T00:00:00Z"),
    ];

    const result = groupByCategory(rows, { perSection: 6, minPerSection: 2 });

    // AI has topScore 0.95 → first; DevTools 0.90 → second; Cloud excluded (only 1 < minPerSection 2)
    expect(result).toHaveLength(2);
    expect(result[0].category).toBe("AI");
    expect(result[0].topScore).toBe(0.95);
    expect(result[0].totalCount).toBe(2);
    expect(result[0].bookmarks).toHaveLength(2);
    expect(result[1].category).toBe("DevTools");
  });

  it("excludes rows with null category", () => {
    const rows: ScoredBookmarkRow[] = [
      makeScoredRow("1", null, 0.99, "2026-02-27T00:00:00Z"),
      makeScoredRow("2", "AI", 0.8, "2026-02-27T00:00:00Z"),
      makeScoredRow("3", "AI", 0.7, "2026-02-26T00:00:00Z"),
    ];

    const result = groupByCategory(rows, { perSection: 6, minPerSection: 2 });

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("AI");
  });

  it("caps bookmarks per section at perSection limit", () => {
    const rows: ScoredBookmarkRow[] = Array.from({ length: 10 }, (_, i) =>
      makeScoredRow(String(i), "AI", 0.9 - i * 0.01, `2026-02-2${Math.min(7, i)}T00:00:00Z`),
    );

    const result = groupByCategory(rows, { perSection: 4, minPerSection: 2 });

    expect(result[0].bookmarks).toHaveLength(4);
    expect(result[0].totalCount).toBe(10);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test __tests__/lib/db/queries/discovery-grouped.test.ts`
Expected: FAIL — module `@/lib/db/queries/discovery-grouped` not found

**Step 3: Write minimal implementation**

```typescript
// src/lib/db/queries/discovery-grouped.ts
import type { UnifiedBookmark } from "@/types/schemas/bookmark";

export type ScoredBookmarkRow = {
  bookmark: Pick<
    UnifiedBookmark,
    "id" | "url" | "title" | "description" | "slug" | "tags" | "dateBookmarked" | "domain"
  > &
    Partial<UnifiedBookmark>;
  category: string | null;
  discoveryScore: number;
};

export type TopicSection = {
  category: string;
  topScore: number;
  totalCount: number;
  bookmarks: ScoredBookmarkRow["bookmark"][];
};

type GroupOptions = {
  perSection: number;
  minPerSection: number;
};

export function groupByCategory(rows: ScoredBookmarkRow[], options: GroupOptions): TopicSection[] {
  const grouped = new Map<string, { scores: number[]; rows: ScoredBookmarkRow[] }>();

  for (const row of rows) {
    if (row.category === null) continue;
    const entry = grouped.get(row.category);
    if (entry) {
      entry.scores.push(row.discoveryScore);
      entry.rows.push(row);
    } else {
      grouped.set(row.category, {
        scores: [row.discoveryScore],
        rows: [row],
      });
    }
  }

  const sections: TopicSection[] = [];

  for (const [category, { rows: catRows }] of grouped) {
    if (catRows.length < options.minPerSection) continue;

    const sorted = catRows.toSorted((a, b) => b.discoveryScore - a.discoveryScore);
    sections.push({
      category,
      topScore: sorted[0].discoveryScore,
      totalCount: catRows.length,
      bookmarks: sorted.slice(0, options.perSection).map((r) => r.bookmark),
    });
  }

  return sections.toSorted((a, b) => b.topScore - a.topScore);
}
```

**Step 4: Run test to verify it passes**

Run: `bun run test __tests__/lib/db/queries/discovery-grouped.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/lib/db/queries/discovery-grouped.ts __tests__/lib/db/queries/discovery-grouped.test.ts
git commit -m "feat(discover): add groupByCategory pure scoring logic with tests"
```

---

## Task 2: Grouping Query — Recently Added Filter

Add the `filterRecentlyAdded` function that extracts bookmarks from the last N days.

**Files:**

- Modify: `src/lib/db/queries/discovery-grouped.ts`
- Modify: `__tests__/lib/db/queries/discovery-grouped.test.ts`

**Step 1: Write the failing test**

```typescript
// Add to __tests__/lib/db/queries/discovery-grouped.test.ts
import { filterRecentlyAdded } from "@/lib/db/queries/discovery-grouped";

describe("filterRecentlyAdded", () => {
  it("returns bookmarks from the last N days sorted by score", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-27T12:00:00Z"));

    const rows: ScoredBookmarkRow[] = [
      makeScoredRow("new1", "AI", 0.95, "2026-02-25T00:00:00Z"), // 2 days ago
      makeScoredRow("new2", "DevTools", 0.8, "2026-02-26T00:00:00Z"), // 1 day ago
      makeScoredRow("old", "Cloud", 0.99, "2026-02-10T00:00:00Z"), // 17 days ago
    ];

    const result = filterRecentlyAdded(rows, { days: 7, limit: 6 });

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("new1"); // higher score first
    expect(result[1].id).toBe("new2");

    vi.useRealTimers();
  });

  it("caps at limit", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-27T12:00:00Z"));

    const rows: ScoredBookmarkRow[] = Array.from({ length: 10 }, (_, i) =>
      makeScoredRow(String(i), "AI", 0.9 - i * 0.01, "2026-02-26T00:00:00Z"),
    );

    const result = filterRecentlyAdded(rows, { days: 7, limit: 3 });

    expect(result).toHaveLength(3);

    vi.useRealTimers();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test __tests__/lib/db/queries/discovery-grouped.test.ts`
Expected: FAIL — `filterRecentlyAdded` not exported

**Step 3: Write minimal implementation**

Add to `src/lib/db/queries/discovery-grouped.ts`:

```typescript
const MS_PER_DAY = 86_400_000;

type RecentOptions = {
  days: number;
  limit: number;
};

export function filterRecentlyAdded(
  rows: ScoredBookmarkRow[],
  options: RecentOptions,
): ScoredBookmarkRow["bookmark"][] {
  const cutoff = Date.now() - options.days * MS_PER_DAY;

  return rows
    .filter((row) => {
      const ts = Date.parse(row.bookmark.dateBookmarked);
      return !Number.isNaN(ts) && ts >= cutoff;
    })
    .toSorted((a, b) => b.discoveryScore - a.discoveryScore)
    .slice(0, options.limit)
    .map((r) => r.bookmark);
}
```

**Step 4: Run test to verify it passes**

Run: `bun run test __tests__/lib/db/queries/discovery-grouped.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add src/lib/db/queries/discovery-grouped.ts __tests__/lib/db/queries/discovery-grouped.test.ts
git commit -m "feat(discover): add filterRecentlyAdded with date cutoff and limit"
```

---

## Task 3: Grouping Query — Full DB Function

Wire up `getDiscoveryGroupedBookmarks()` that queries the database and calls the
pure functions from Tasks 1-2. This reuses the same DB join + scoring pattern from
`discovery-scores.ts:getDiscoveryRankedBookmarks`.

**Files:**

- Modify: `src/lib/db/queries/discovery-grouped.ts`

**Step 1: Implement the DB query function**

Add to `src/lib/db/queries/discovery-grouped.ts`:

```typescript
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { mapBookmarkRowToUnifiedBookmark } from "@/lib/db/bookmark-record-mapper";
import { db } from "@/lib/db/connection";
import { aiAnalysisLatest } from "@/lib/db/schema/ai-analysis";
import { bookmarks } from "@/lib/db/schema/bookmarks";
import { contentEngagement } from "@/lib/db/schema/content-engagement";
import {
  computeBaseRecencyScore,
  computeDiscoveryScore,
  computeEngagementSignal,
} from "./discovery-scores";
import type { SerializableBookmark } from "@/types/features/bookmarks";

const NINETY_DAYS_MS = 90 * MS_PER_DAY;
const PER_SECTION = 6;
const MIN_PER_SECTION = 2;
const RECENT_DAYS = 7;
const RECENT_LIMIT = 6;

export type DiscoverFeedData = {
  recentlyAdded: SerializableBookmark[];
  topicSections: Array<{
    category: string;
    topScore: number;
    totalCount: number;
    bookmarks: SerializableBookmark[];
  }>;
  internalHrefs: Record<string, string>;
};

export async function getDiscoveryGroupedBookmarks(): Promise<DiscoverFeedData> {
  // 1. Load engagement data (same pattern as discovery-scores.ts:89-139)
  let engagementRows: Array<{
    contentId: string;
    impressions: number;
    clicks: number;
    avgDwellMs: number;
    externalClicks: number;
    latestEventAt: string;
  }> = [];

  try {
    engagementRows = await db
      .select({
        contentId: contentEngagement.contentId,
        impressions: sql<number>`count(*) filter (where ${contentEngagement.eventType} = 'impression')::int`,
        clicks: sql<number>`count(*) filter (where ${contentEngagement.eventType} = 'click')::int`,
        avgDwellMs: sql<number>`coalesce(avg(${contentEngagement.durationMs}) filter (where ${contentEngagement.eventType} = 'dwell'), 0)::float`,
        externalClicks: sql<number>`count(*) filter (where ${contentEngagement.eventType} = 'external_click')::int`,
        latestEventAt: sql<string>`max(${contentEngagement.createdAt})::text`,
      })
      .from(contentEngagement)
      .where(
        and(
          eq(contentEngagement.contentType, "bookmark"),
          gte(contentEngagement.createdAt, new Date(Date.now() - NINETY_DAYS_MS)),
        ),
      )
      .groupBy(contentEngagement.contentId);
  } catch {
    // Engagement unavailable — fall back to recency-only
  }

  const engagementMap = new Map(
    engagementRows.map((row) => {
      const latestMs = Date.parse(row.latestEventAt) || Date.now();
      return [
        row.contentId,
        computeEngagementSignal({
          impressions: row.impressions,
          clicks: row.clicks,
          avgDwellMs: row.avgDwellMs,
          externalClicks: row.externalClicks,
          ageInDays: Math.max(0, Date.now() - latestMs) / MS_PER_DAY,
        }),
      ] as const;
    }),
  );

  // 2. Load all bookmarks with categories
  const bookmarkRows = await db
    .select({
      bookmark: bookmarks,
      category: sql<
        string | null
      >`nullif(trim(${aiAnalysisLatest.payload} -> 'analysis' ->> 'category'), '')`,
    })
    .from(bookmarks)
    .leftJoin(
      aiAnalysisLatest,
      and(eq(aiAnalysisLatest.domain, "bookmarks"), eq(aiAnalysisLatest.entityId, bookmarks.id)),
    )
    .orderBy(desc(bookmarks.dateBookmarked));

  const engagementCoverage =
    bookmarkRows.length === 0 ? 0 : engagementMap.size / bookmarkRows.length;

  // 3. Score all rows
  const scored: ScoredBookmarkRow[] = bookmarkRows.map((row) => {
    const mapped = mapBookmarkRowToUnifiedBookmark(row.bookmark);
    const engagementSignal = engagementMap.get(row.bookmark.id) ?? null;
    const baseRecencyScore = computeBaseRecencyScore(mapped.dateBookmarked);
    return {
      bookmark: mapped,
      category: row.category,
      discoveryScore: computeDiscoveryScore({
        baseRecencyScore,
        engagementSignal,
        engagementCoverage,
      }),
    };
  });

  // 4. Group into sections
  const topicSections = groupByCategory(scored, {
    perSection: PER_SECTION,
    minPerSection: MIN_PER_SECTION,
  });

  // 5. Filter recently added
  const recentBookmarks = filterRecentlyAdded(scored, {
    days: RECENT_DAYS,
    limit: RECENT_LIMIT,
  });

  // 6. Build internal hrefs + serialize
  const allBookmarks = [...recentBookmarks, ...topicSections.flatMap((s) => s.bookmarks)];
  const internalHrefs: Record<string, string> = {};
  const serialize = (bm: ScoredBookmarkRow["bookmark"]): SerializableBookmark => {
    internalHrefs[bm.id] = `/bookmarks/${bm.slug}`;
    return {
      id: bm.id,
      url: bm.url,
      title: bm.title,
      description: bm.description,
      slug: bm.slug,
      tags: Array.isArray(bm.tags) ? bm.tags : [],
      dateBookmarked: bm.dateBookmarked,
      ogImage: bm.ogImage,
      ogImageExternal: bm.ogImageExternal,
      content: bm.content,
      isPrivate: bm.isPrivate ?? false,
      isFavorite: bm.isFavorite ?? false,
      readingTime: bm.readingTime,
      wordCount: bm.wordCount,
      ogTitle: bm.ogTitle,
      ogDescription: bm.ogDescription,
      domain: bm.domain,
      logoData: bm.logoData ?? null,
      category: bm.category,
    };
  };

  // Deduplicate
  for (const bm of allBookmarks) {
    if (!internalHrefs[bm.id]) {
      serialize(bm);
    }
  }

  return {
    recentlyAdded: recentBookmarks.map(serialize),
    topicSections: topicSections.map((section) => ({
      category: section.category,
      topScore: section.topScore,
      totalCount: section.totalCount,
      bookmarks: section.bookmarks.map(serialize),
    })),
    internalHrefs,
  };
}
```

**Step 2: Run type check**

Run: `bun run type-check`
Expected: PASS (no type errors in new file)

**Step 3: Commit**

```bash
git add src/lib/db/queries/discovery-grouped.ts
git commit -m "feat(discover): wire up getDiscoveryGroupedBookmarks DB query"
```

---

## Task 4: Compact Card Variant

Add `variant="compact"` to `BookmarkCardClient`. This renders the image-dominant
card with title, domain overlay, category + date, and up to 3 tag pills.

**Files:**

- Modify: `src/types/features/bookmarks.ts` (line 51 — extend variant union)
- Modify: `src/components/features/bookmarks/bookmark-card.client.tsx`

**Step 1: Extend the variant type**

In `src/types/features/bookmarks.ts`, change line 51:

```typescript
  variant?: "default" | "hero" | "compact";
```

**Step 2: Add compact rendering branch**

In `src/components/features/bookmarks/bookmark-card.client.tsx`, after the existing
`const isHero = variant === "hero";` line (75), add:

```typescript
const isCompact = variant === "compact";
```

Then add a compact return branch BEFORE the existing return statement (line 129).
The compact variant strips description, reading time, share button, notes, and star.
It uses `rounded-2xl` instead of `rounded-3xl`, and limits tags to 3.

```typescript
if (isCompact) {
  return (
    <div className="relative flex flex-col bg-white/50 dark:bg-gray-800/50 backdrop-blur-lg ring-0 rounded-2xl overflow-hidden shadow-xl hover:shadow-2xl transform transition-all duration-200 hover:scale-[1.005]">
      <div className="relative w-full aspect-video overflow-hidden rounded-t-2xl bg-gray-100 dark:bg-gray-800">
        {effectiveInternalHref ? (
          <Link href={effectiveInternalHref} title={title} className="absolute inset-0 block" prefetch={false}>
            <div className="relative w-full h-full">
              <OptimizedCardImage src={displayImageUrl ?? null} alt={title} preload={preload} />
            </div>
          </Link>
        ) : (
          <ExternalLink href={url} title={title} showIcon={false} className="absolute inset-0 block">
            <div className="relative w-full h-full">
              <OptimizedCardImage src={displayImageUrl ?? null} alt={title} preload={preload} />
            </div>
          </ExternalLink>
        )}
        <ExternalLink
          href={url}
          title={`Visit ${domainWithoutWWW}`}
          showIcon={false}
          className="absolute bottom-2 left-2 bg-white/80 dark:bg-gray-800/80 px-2 py-0.5 flex items-center space-x-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors z-10"
        >
          <LucideExternalLinkIcon className="w-3 h-3 text-gray-700 dark:text-gray-200" />
          <span className="text-xs text-gray-700 dark:text-gray-200">{domainWithoutWWW}</span>
        </ExternalLink>
      </div>
      <div className="p-3 flex flex-col gap-2">
        {effectiveInternalHref ? (
          <Link href={effectiveInternalHref} title={displayTitle} className="text-gray-900 dark:text-white hover:text-blue-600 transition-colors" prefetch={false}>
            <h3 className="text-sm font-semibold line-clamp-2">{displayTitle}</h3>
          </Link>
        ) : (
          <ExternalLink href={url} title={displayTitle} showIcon={false} className="text-gray-900 dark:text-white hover:text-blue-600 transition-colors">
            <h3 className="text-sm font-semibold line-clamp-2">{displayTitle}</h3>
          </ExternalLink>
        )}
        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          {category && <Badge variant="secondary" className="text-[10px] uppercase tracking-wide px-1.5 py-0">{category}</Badge>}
          {category && <span>·</span>}
          <span>{formattedBookmarkDate}</span>
        </div>
        {rawTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {rawTags.slice(0, 3).map((raw) => (
              <Link key={raw} href={`/bookmarks/tags/${tagToSlug(raw)}`} className="inline-block" prefetch={false}>
                <Badge variant="outline" className="text-[10px] hover:bg-accent">{formatTagDisplay(raw)}</Badge>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 3: Run type check**

Run: `bun run type-check`
Expected: PASS

**Step 4: Commit**

```bash
git add src/types/features/bookmarks.ts src/components/features/bookmarks/bookmark-card.client.tsx
git commit -m "feat(discover): add compact card variant for topic section grids"
```

---

## Task 5: TopicGrid Component

Simple responsive grid container.

**Files:**

- Create: `src/components/features/bookmarks/topic-grid.client.tsx`

**Step 1: Create the component**

```typescript
// src/components/features/bookmarks/topic-grid.client.tsx
"use client";

import type { ReactNode } from "react";

export function TopicGrid({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {children}
    </div>
  );
}
```

**Step 2: Run type check**

Run: `bun run type-check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/features/bookmarks/topic-grid.client.tsx
git commit -m "feat(discover): add TopicGrid responsive container component"
```

---

## Task 6: TopicSection Component

Renders one topic section: heading with separator, card grid, and "See all" link.

**Files:**

- Create: `src/components/features/bookmarks/topic-section.client.tsx`

**Step 1: Create the component**

```typescript
// src/components/features/bookmarks/topic-section.client.tsx
"use client";

import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { BookmarkCardClient } from "./bookmark-card.client";
import { ImpressionTracker } from "./impression-tracker.client";
import { TopicGrid } from "./topic-grid.client";
import type { SerializableBookmark } from "@/types/features/bookmarks";
import type { EngagementContentType } from "@/types/schemas/engagement";

type TopicSectionProps = {
  id: string;
  category: string;
  totalCount: number;
  bookmarks: SerializableBookmark[];
  internalHrefs: Readonly<Record<string, string>>;
  onImpression: (contentType: EngagementContentType, contentId: string) => void;
  showSeeAll?: boolean;
};

export function TopicSection({
  id,
  category,
  totalCount,
  bookmarks,
  internalHrefs,
  onImpression,
  showSeeAll = true,
}: Readonly<TopicSectionProps>) {
  if (bookmarks.length === 0) return null;

  const seeAllHref = `/bookmarks?category=${encodeURIComponent(category)}`;

  return (
    <section id={id} className="scroll-mt-16" aria-label={category}>
      <div className="flex items-center gap-4 mb-4">
        <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground shrink-0">
          {category}
        </h2>
        <Separator className="flex-1" />
        {showSeeAll && totalCount > bookmarks.length && (
          <Link
            href={seeAllHref}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
            prefetch={false}
          >
            See all {totalCount} →
          </Link>
        )}
      </div>
      <TopicGrid>
        {bookmarks.map((bookmark, index) => (
          <ImpressionTracker
            key={bookmark.id}
            contentType="bookmark"
            contentId={bookmark.id}
            onImpression={onImpression}
          >
            <BookmarkCardClient
              {...(bookmark as any)}
              variant="compact"
              internalHref={internalHrefs[bookmark.id]}
              preload={index < 2}
            />
          </ImpressionTracker>
        ))}
      </TopicGrid>
    </section>
  );
}
```

Note: The `as any` cast on the spread is needed because `SerializableBookmark` is a
subset of `BookmarkCardClientProps`. A more precise approach would be a shared
conversion utility, but the existing codebase uses this pattern in
`bookmarks-with-pagination.client.tsx:334`.

**Step 2: Run type check**

Run: `bun run type-check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/features/bookmarks/topic-section.client.tsx
git commit -m "feat(discover): add TopicSection component with heading, grid, and See all link"
```

---

## Task 7: DiscoverFeed Client Component

The client wrapper that renders the category ribbon (scroll-to-section mode) and
all topic sections. Receives pre-rendered data from the server component.

**Files:**

- Create: `src/components/features/bookmarks/discover-feed.client.tsx`

**Step 1: Create the component**

```typescript
// src/components/features/bookmarks/discover-feed.client.tsx
"use client";

import { useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TopicSection } from "./topic-section.client";
import { useEngagementTracker } from "@/hooks/use-engagement-tracker";
import type { DiscoverFeedData } from "@/lib/db/queries/discovery-grouped";

type DiscoverFeedProps = {
  data: DiscoverFeedData;
};

function slugify(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function DiscoverFeed({ data }: Readonly<DiscoverFeedProps>) {
  const { trackImpression } = useEngagementTracker();

  const categories = useMemo(
    () => data.topicSections.map((s) => ({ name: s.category, id: slugify(s.category) })),
    [data.topicSections],
  );

  const scrollToSection = useCallback((sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  return (
    <div className="w-full max-w-[95%] xl:max-w-[1400px] 2xl:max-w-[1800px] mx-auto px-4">
      {/* Sticky Category Ribbon */}
      <nav
        className="sticky top-0 z-30 bg-background/80 backdrop-blur-sm border-b border-border -mx-4 px-4 py-2 mb-8"
        aria-label="Topic navigation"
      >
        <div className="flex items-center gap-2 overflow-x-auto">
          {categories.map((cat) => (
            <Button
              key={cat.id}
              type="button"
              size="sm"
              variant="ghost"
              className="shrink-0 rounded-full"
              onClick={() => scrollToSection(cat.id)}
            >
              {cat.name}
            </Button>
          ))}
        </div>
      </nav>

      {/* Recently Added */}
      {data.recentlyAdded.length > 0 && (
        <div className="mb-12">
          <TopicSection
            id="recently-added"
            category="Recently Added"
            totalCount={data.recentlyAdded.length}
            bookmarks={data.recentlyAdded}
            internalHrefs={data.internalHrefs}
            onImpression={trackImpression}
            showSeeAll={false}
          />
        </div>
      )}

      {/* Topic Sections */}
      <div className="space-y-12">
        {data.topicSections.map((section) => (
          <TopicSection
            key={section.category}
            id={slugify(section.category)}
            category={section.category}
            totalCount={section.totalCount}
            bookmarks={section.bookmarks}
            internalHrefs={data.internalHrefs}
            onImpression={trackImpression}
          />
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Run type check**

Run: `bun run type-check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/features/bookmarks/discover-feed.client.tsx
git commit -m "feat(discover): add DiscoverFeed client component with sticky ribbon and topic sections"
```

---

## Task 8: Wire Up page.tsx

Modify the bookmarks page to call `getDiscoveryGroupedBookmarks()` directly from
the Server Component and render `DiscoverFeed` for discover mode.

**Files:**

- Modify: `src/app/bookmarks/page.tsx`

**Step 1: Update page.tsx**

Replace the current `<div className="max-w-5xl mx-auto">` wrapper with a
conditional that renders `DiscoverFeed` for discover mode and the existing
`BookmarksServer` for latest/tag-filtered modes.

The key change: the page reads `searchParams` to determine the feed mode. If
`?feed=latest` or `?tag=...` is present, fall through to the existing
`BookmarksServer`. Otherwise, render the new `DiscoverFeed` with full-width layout.

```typescript
import { getDiscoveryGroupedBookmarks } from "@/lib/db/queries/discovery-grouped";
import { DiscoverFeed } from "@/components/features/bookmarks/discover-feed.client";

// Inside BookmarksPage, after the JSON-LD generation:
const params = await searchParams;
const feedMode = params.feed === "latest" ? "latest" : "discover";
const hasTagFilter = Boolean(params.tag);

if (feedMode === "discover" && !hasTagFilter) {
  const discoverData = await getDiscoveryGroupedBookmarks();
  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <DiscoverFeed data={discoverData} />
    </>
  );
}

// Fallback to existing BookmarksServer for latest/filtered views
return (
  <>
    <JsonLdScript data={jsonLdData} />
    <div className="max-w-5xl mx-auto">
      <BookmarksServer
        title={pageMetadata.title}
        description={pageMetadata.description}
        initialPage={1}
        includeImageData={true}
      />
    </div>
  </>
);
```

**Step 2: Run type check**

Run: `bun run type-check`
Expected: PASS

**Step 3: Run validate**

Run: `bun run validate`
Expected: PASS with 0 errors, 0 warnings

**Step 4: Commit**

```bash
git add src/app/bookmarks/page.tsx
git commit -m "feat(discover): wire up topic-organized DiscoverFeed in bookmarks page"
```

---

## Task 9: Integration Test

Test the full discover feed data flow with mocked DB.

**Files:**

- Create: `__tests__/lib/db/queries/discovery-grouped-integration.test.ts`

**Step 1: Write the integration test**

```typescript
import {
  groupByCategory,
  filterRecentlyAdded,
  type ScoredBookmarkRow,
} from "@/lib/db/queries/discovery-grouped";

function makeRow(
  id: string,
  category: string | null,
  score: number,
  dateBookmarked: string,
): ScoredBookmarkRow {
  return {
    bookmark: {
      id,
      url: `https://example.com/${id}`,
      title: `Title ${id}`,
      description: `Desc ${id}`,
      slug: `slug-${id}`,
      tags: ["tag-a", "tag-b"],
      dateBookmarked,
      domain: "example.com",
      ogImage: `https://example.com/${id}.png`,
      category,
    },
    category,
    discoveryScore: score,
  };
}

describe("discovery grouped integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-27T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("produces a complete discover feed structure", () => {
    const rows: ScoredBookmarkRow[] = [
      makeRow("1", "AI", 0.95, "2026-02-26T00:00:00Z"),
      makeRow("2", "AI", 0.85, "2026-02-25T00:00:00Z"),
      makeRow("3", "AI", 0.75, "2026-02-20T00:00:00Z"),
      makeRow("4", "DevTools", 0.9, "2026-02-27T00:00:00Z"),
      makeRow("5", "DevTools", 0.8, "2026-02-26T00:00:00Z"),
      makeRow("6", "Cloud", 0.6, "2026-01-15T00:00:00Z"),
    ];

    const recent = filterRecentlyAdded(rows, { days: 7, limit: 6 });
    const sections = groupByCategory(rows, { perSection: 6, minPerSection: 2 });

    // Recently added: items 1, 2, 4, 5 are within 7 days
    expect(recent.length).toBeGreaterThanOrEqual(4);

    // Sections: AI (3 items, topScore 0.95), DevTools (2 items, topScore 0.90)
    // Cloud excluded (only 1 item < minPerSection 2)
    expect(sections).toHaveLength(2);
    expect(sections[0].category).toBe("AI");
    expect(sections[1].category).toBe("DevTools");

    // Each section's bookmarks are sorted by score descending
    expect(sections[0].bookmarks[0].id).toBe("1");
    expect(sections[1].bookmarks[0].id).toBe("4");
  });
});
```

**Step 2: Run test**

Run: `bun run test __tests__/lib/db/queries/discovery-grouped-integration.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add __tests__/lib/db/queries/discovery-grouped-integration.test.ts
git commit -m "test(discover): add integration test for grouped feed structure"
```

---

## Task 10: Full Validation & Cleanup

Run the complete validation suite and verify no regressions.

**Step 1: Run all tests**

Run: `bun run test`
Expected: All existing tests still pass + new tests pass

**Step 2: Run full validation**

Run: `bun run validate`
Expected: 0 errors, 0 warnings

**Step 3: Run type check including tests**

Run: `bun run type-check && bun run type-check:tests`
Expected: PASS

**Step 4: Check file sizes**

Run: `bun run check:file-size`
Expected: No new violations (all new files are well under 350 LOC)

**Step 5: Manual verification**

Start dev server: `bun run dev`
Navigate to `http://localhost:3000/bookmarks`
Verify:

- Topic sections appear with category headings
- "Recently Added" section shows recent bookmarks
- Cards display OG images, titles, domain overlays, and up to 3 tags
- Category ribbon scrolls to sections on click
- "See all N →" links navigate to filtered view
- `/bookmarks?feed=latest` still renders the old layout
- Mobile viewport shows single-column cards
- Dark mode renders correctly

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat(discover): complete topic-organized Discover page redesign

Replaces the narrow single-feed /bookmarks Discover layout with a
full-viewport, topic-organized experience:
- Server-rendered topic sections grouped by AI-analyzed category
- Image-dominant compact cards with OG images, titles, and tags
- Sticky category ribbon with scroll-to-section navigation
- Discovery-scored ordering (82% recency + 18% engagement)
- Full SSR for SEO (Googlebot sees all content without JS)
- Existing Latest mode and tag-filtered views preserved"
```

---

## File Inventory

### Created (4 files)

- `src/lib/db/queries/discovery-grouped.ts` (~120 LOC)
- `src/components/features/bookmarks/discover-feed.client.tsx` (~80 LOC)
- `src/components/features/bookmarks/topic-section.client.tsx` (~60 LOC)
- `src/components/features/bookmarks/topic-grid.client.tsx` (~10 LOC)

### Test Files Created (2 files)

- `__tests__/lib/db/queries/discovery-grouped.test.ts`
- `__tests__/lib/db/queries/discovery-grouped-integration.test.ts`

### Modified (2 files)

- `src/types/features/bookmarks.ts` (line 51 — extend variant union)
- `src/app/bookmarks/page.tsx` (conditional discover vs. latest rendering)
- `src/components/features/bookmarks/bookmark-card.client.tsx` (compact variant branch)
