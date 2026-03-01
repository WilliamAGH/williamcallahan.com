# Discover Page Redesign

> Redesign the `/bookmarks` Discover route from a narrow single-feed layout to a
> full-viewport, topic-organized discovery experience with image-dominant cards.

## Design Decisions

| Decision         | Choice                         | Rationale                                                                 |
| ---------------- | ------------------------------ | ------------------------------------------------------------------------- |
| Layout model     | Topic sections                 | Distinct sections per category (Netflix browse style)                     |
| Card style       | Image-dominant + tags          | Large OG image, title, domain overlay, category + date, up to 3 tags      |
| Section ordering | Discovery-scored               | Categories ordered by highest discovery score in that category            |
| Category ribbon  | Scroll-to-section + "See all"  | Ribbon click scrolls to section; "See all N" links to filtered grid       |
| Data layer       | Server-first (direct DB query) | Server Component calls query directly for full SSR/SEO                    |
| Viewport         | Full-width                     | Matches site header: `max-w-[95%] xl:max-w-[1400px] 2xl:max-w-[1800px]`   |
| Grid columns     | Responsive 1-5                 | `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5` |

## Page Structure

```
[Sticky Category Ribbon] ── scroll-to-section anchors

── Recently Added ─────────────────────────────────
[card][card][card][card][card][card]  ← last 7 days, top 6

── AI & Machine Learning ────────── [See all 87 →]
[card][card][card][card][card][card]  ← top 6 by discovery score

── Developer Tools ──────────────── [See all 124 →]
[card][card][card][card][card][card]

...more topic sections ordered by top discovery score...
```

## Card Design (Compact Variant)

```
┌────────────────────────┐
│                        │
│    OG IMAGE            │  aspect-video, rounded-2xl top
│    (aspect-video)      │
│  ┌─────────────────┐   │  domain pill overlay (bottom-left)
│  │ 🔗 github.com   │   │
│  └─────────────────┘   │
├────────────────────────┤
│ Title (line-clamp-2)   │  font-semibold
│ AI/ML • Jan 15         │  category badge + date
│ [tag1] [tag2] [tag3]   │  up to 3 tag pills
└────────────────────────┘
```

Removed from compact variant (vs default card): description, reading time, share
button, note, star indicator. These remain on the detail page.

## Data Layer

### New Query: `getDiscoveryGroupedBookmarks()`

Location: `src/lib/db/queries/discovery-grouped.ts`

Reuses existing scoring functions from `discovery-scores.ts`:

- `computeBaseRecencyScore()`
- `computeEngagementSignal()`
- `computeDiscoveryScore()`

Returns:

```typescript
{
  recentlyAdded: SerializableBookmark[]      // last 7 days, top 6
  topicSections: Array<{
    category: string                          // "AI & Machine Learning"
    topScore: number                          // highest score in category
    totalCount: number                        // total bookmarks in category
    bookmarks: SerializableBookmark[]         // top 6 by discovery score
  }>
  internalHrefs: Record<string, string>       // id → /bookmarks/slug
}
```

Section ordering: `topicSections` sorted by `topScore` descending.

### Server Component Flow

```
page.tsx (Server Component)
  → await getDiscoveryGroupedBookmarks()     (direct DB, no API hop)
  → <DiscoverFeed data={...} />              (client: ribbon scroll)
```

SEO: Full HTML at TTFB. Googlebot sees all sections without JS execution.
Caching: ISR with `revalidate = 60` (60-second incremental regeneration).

## Component Architecture

### New Files

| File                                                         | Purpose                                                    | Est. LOC |
| ------------------------------------------------------------ | ---------------------------------------------------------- | -------- |
| `src/lib/db/queries/discovery-grouped.ts`                    | Group bookmarks by category with discovery scores          | ~120     |
| `src/components/features/bookmarks/discover-feed.client.tsx` | Client wrapper: ribbon scroll-to-section + section anchors | ~80      |
| `src/components/features/bookmarks/topic-section.client.tsx` | Single topic section: heading + grid + "See all" link      | ~60      |
| `src/components/features/bookmarks/topic-grid.client.tsx`    | Responsive grid container for compact cards                | ~30      |

### Modified Files

| File                                   | Change                                                    |
| -------------------------------------- | --------------------------------------------------------- |
| `bookmark-card.client.tsx`             | Add `variant="compact"` rendering branch                  |
| `bookmarks/page.tsx`                   | Call grouped query for discover mode, render DiscoverFeed |
| `bookmarks-with-pagination.client.tsx` | Unchanged for Latest mode and "See all" filtered views    |
| `category-ribbon.client.tsx`           | Add scroll-to-section behavior via new `mode` prop        |

### Unchanged

- `BookmarksServer`, `BookmarksPaginatedClient`, `BookmarksWindow` (Latest mode)
- `HeroRow`, `SectionBreak` (preserved but not used in Discover)
- All existing API routes (`/api/bookmarks`, `/api/bookmarks/categories`)
- Engagement tracking, impression tracker (reused in TopicSection)

## "See All" Behavior

"See all N →" within each topic section navigates to:
`/bookmarks?category=<encoded-category-name>`

This reuses the existing category filter in `BookmarksWithPagination` (via
`CategoryRibbon` selection + `usePagination` fetching from `/api/bookmarks`).

## Visual Integration

All visual choices below are retained from the existing site design system. No new
colors, gradients, fonts, or decorative effects are introduced.

- **Radius**: `rounded-2xl` (tighter than current `rounded-3xl` for denser grid)
- **Background**: Existing card pattern: `bg-white/50 dark:bg-gray-800/50 backdrop-blur-lg`
- **Hover**: Existing micro-interaction: `hover:shadow-2xl hover:scale-[1.005]`
- **Typography**: Inter (site font), section headings match existing `text-xs uppercase tracking-[0.18em] text-muted-foreground` pattern from `hero-row.client.tsx:18`
- **Dark mode**: Full support via existing HSL CSS variables
- **Animations**: None. Content appears immediately. OG images are the visual interest.

## Edge Cases

- **Mobile (< 640px)**: Single-column grid (`grid-cols-1`). Cards remain full-width.
- **Empty categories**: Excluded from the page (no empty sections rendered).
- **Feed toggle**: Existing FeedToggle retained. "Latest" renders current `BookmarksWithPagination`; "Discover" renders the new `DiscoverFeed`.
- **Loading state**: Skeleton grid (aspect-video + text placeholders) per section, matching existing skeleton in `bookmarks-with-pagination.client.tsx:279-290`.
- **Categories with < 2 bookmarks**: Excluded from topic sections (not useful as a section).
