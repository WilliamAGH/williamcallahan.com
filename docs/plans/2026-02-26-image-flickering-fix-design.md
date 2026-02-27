# Design: Eliminate Image Flickering on Bookmark Cards

**Date:** 2026-02-26
**Scope:** `OptimizedCardImage`, bookmark pagination/options components, `cdn-utils.ts`
**Approach:** B (Complete Fix) — addresses all 7 diagnosed causes

## Problem

Bookmark card images flicker on page load due to 7 compounding causes:

1. `mounted` state gate replaces entire card grid after hydration (zero SSR images)
2. Dual-Image LQIP layer removed from DOM without opacity transition
3. No `blurDataURL` passed — forces custom LQIP instead of native blur
4. Two `<Image>` tags per card — double network requests
5. `unoptimized: true` on `/api/assets` URLs — bypasses Next.js optimization
6. Skeleton placeholder height mismatch — layout shift on mount
7. Asset proxy cold-start latency for uncached Karakeep images

## Changes

### 1. Remove `mounted` Gate for Card Grid

**Files:** `bookmarks-with-pagination.client.tsx`, `bookmarks-with-options.client.tsx`

Always render the real card grid (SWR `fallbackData` provides initial bookmarks).
Keep `mounted` gate only for: pagination nav, results count text, refresh button.
Fixes: Cause 1, Cause 6.

### 2. Replace Dual-Image LQIP with Native Blur

**File:** `logo-image.client.tsx` (OptimizedCardImage)

- Remove the LQIP `<Image>` overlay layer
- Remove `mainLoaded` state and conditional rendering
- Use `placeholder="blur"` + `Placeholder.blurDataURL` (from static import of `opengraph-placeholder.png`)
- Remove `CARD_IMAGE_BLUR_WIDTH`, `CARD_IMAGE_BLUR_QUALITY` constants

Fixes: Causes 2, 3, 4.

### 3. Enable Next.js Optimization for `/api/assets`

**File:** `cdn-utils.ts`

Remove `ASSET_PROXY_PATH` from `shouldBypassOptimizer`. Keep `IMAGE_PROXY_PATH`.
`localPatterns` in `next.config.ts` already permits `/api/assets/**`.
Asset proxy streams raw bytes (no resize), so Next.js optimization adds real value.

Fixes: Cause 5.

### 4. Update Documentation

**File:** `docs/architecture/image-handling.md`

Update Image Optimization Decision Matrix: `/api/assets` no longer uses `unoptimized`.
Update `shouldBypassOptimizer` description.

### Affected Routes

All routes using `OptimizedCardImage`:

- `/bookmarks`, `/bookmarks/*` (all changes)
- `/blog`, `/blog/*` (changes 2-3)
- `/projects`, `/projects/*` (changes 2-3)
- `/books` (changes 2-3, already passes blurDataURL)

## Non-Goals

- Per-image blur data URL generation (YAGNI — generic themed placeholder sufficient)
- Server component refactor of BookmarkCardClient (uses `usePathname`)
- Changes to LogoImage component (separate concern, already uses native blur)
