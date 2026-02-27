# Image Flickering Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate image flickering on bookmark cards (and all OptimizedCardImage consumers) by removing the mounted gate, replacing dual-Image LQIP with native blur, and enabling Next.js optimization for asset proxy URLs.

**Architecture:** Remove the `mounted` state gate so cards are SSR'd with `<img>` tags in HTML. Replace the custom dual-`<Image>` LQIP with Next.js native `placeholder="blur"` using the existing `opengraph-placeholder.png` static import. Enable `/_next/image` optimization for `/api/assets` URLs by narrowing `shouldBypassOptimizer`.

**Tech Stack:** Next.js 16.1.6, React 19, next/image, Vitest

**Design doc:** `docs/plans/2026-02-26-image-flickering-fix-design.md`

---

### Task 1: Simplify `OptimizedCardImage` — Remove LQIP, Use Native Blur

**Files:**

- Modify: `src/components/ui/logo-image.client.tsx:228-346`
- Test: `__tests__/components/ui/logo-image.test.tsx:245-273`

**Step 1: Update existing tests to match new behavior**

The test at line 248 ("renders dual-Image LQIP: blur preview + main image") asserts 2 images. After the change, there will be 1 image with native blur. Update:

```tsx
// __tests__/components/ui/logo-image.test.tsx
// Replace the dual-LQIP test with:

it("renders single Image with native blur placeholder", () => {
  render(<OptimizedCardImage src={cardSrc} alt="Project screenshot" />);
  const images = screen.getAllByTestId("next-image-mock");

  // Single image with native blur (no LQIP overlay)
  expect(images).toHaveLength(1);
  expect(images[0]).toHaveAttribute("src", cardSrc);
  expect(images[0]).toHaveAttribute("data-placeholder", "blur");
  // blurDataURL comes from the static opengraph-placeholder.png import
  expect(images[0].getAttribute("data-blur-data-url")).toBeTruthy();
});
```

Also add a test for when `blurDataURL` is explicitly provided (book cards pass their own):

```tsx
it("uses provided blurDataURL over default when given", () => {
  const customBlur = "data:image/png;base64,CUSTOM";
  render(<OptimizedCardImage src={cardSrc} alt="Book cover" blurDataURL={customBlur} />);
  const image = screen.getByTestId("next-image-mock");
  expect(image).toHaveAttribute("data-placeholder", "blur");
  expect(image).toHaveAttribute("data-blur-data-url", customBlur);
});
```

**Step 2: Run tests to verify they fail**

Run: `bun run test -- __tests__/components/ui/logo-image.test.tsx --reporter=verbose`
Expected: FAIL — still renders 2 images (LQIP + main), placeholder is "empty"

**Step 3: Implement the simplified OptimizedCardImage**

In `src/components/ui/logo-image.client.tsx`:

1. Remove constants `CARD_IMAGE_BLUR_WIDTH` (line 58) and `CARD_IMAGE_BLUR_QUALITY` (line 59)
2. Remove `mainLoaded` state (line 240) and its setter usage
3. Remove the entire LQIP `<Image>` block (lines 289-300) and the Fragment wrapper
4. Change the main `<Image>` to always use `placeholder="blur"`:
   - If `blurDataURL` prop is provided (starts with `data:`), use it
   - Otherwise use `Placeholder.blurDataURL` from the static import (already imported at line 226)
5. Remove the `useNativeBlur` variable (line 253) — no longer needed
6. Keep: error retry logic, `proxiedSrc` memo, placeholder fallback for null src

The simplified render for the non-null, non-errored case:

```tsx
return (
  <Image
    key={retryKey}
    src={proxiedSrc}
    alt={alt}
    fill
    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 600px"
    quality={80}
    placeholder="blur"
    blurDataURL={blurDataURL?.startsWith("data:") ? blurDataURL : Placeholder.blurDataURL}
    className={`${objectFitClass} ${className}`}
    {...(preload ? { preload, fetchPriority: "high" as const } : {})}
    {...(shouldBypassOptimizer(proxiedSrc) ? { unoptimized: true } : {})}
    onLoad={() => {
      setErrored(false);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    }}
    onError={() => {
      // ... existing retry logic unchanged ...
    }}
  />
);
```

**Step 4: Run tests to verify they pass**

Run: `bun run test -- __tests__/components/ui/logo-image.test.tsx --reporter=verbose`
Expected: PASS — all tests green

**Step 5: Run type-check**

Run: `bun run type-check`
Expected: No errors

---

### Task 2: Narrow `shouldBypassOptimizer` — Enable Optimization for `/api/assets`

**Files:**

- Modify: `src/lib/utils/cdn-utils.ts:345-350`
- Test: `__tests__/components/ui/logo-image.test.tsx:19-26` (mock update)

**Step 1: Update the test mock for `shouldBypassOptimizer`**

In `__tests__/components/ui/logo-image.test.tsx`, update the mock at line 19-26:

```tsx
shouldBypassOptimizer: (src: string | undefined) => {
  if (!src) return false;
  return (
    src.startsWith("/api/cache/images") ||
    src.startsWith("data:")
  );
  // NOTE: /api/assets/ deliberately removed — Next.js optimizes these now
},
```

Add a test that verifies asset proxy URLs are NOT bypassed:

```tsx
it("does not set unoptimized for /api/assets URLs", () => {
  const assetSrc = "/api/assets/abc123?bid=1&url=https://example.com&domain=example.com";
  render(<OptimizedCardImage src={assetSrc} alt="Bookmark screenshot" />);
  const image = screen.getByTestId("next-image-mock");
  expect(image).toHaveAttribute("data-unoptimized", "false");
});
```

**Step 2: Run tests to verify the new test fails**

Run: `bun run test -- __tests__/components/ui/logo-image.test.tsx --reporter=verbose`
Expected: FAIL — `/api/assets` still triggers `unoptimized: true`

**Step 3: Update `shouldBypassOptimizer` in cdn-utils.ts**

Change `src/lib/utils/cdn-utils.ts:345-350` from:

```tsx
export function shouldBypassOptimizer(src: string | undefined): boolean {
  if (!src) return false;
  return (
    src.startsWith(IMAGE_PROXY_PATH) || src.startsWith(ASSET_PROXY_PATH) || src.startsWith("data:")
  );
}
```

To:

```tsx
export function shouldBypassOptimizer(src: string | undefined): boolean {
  if (!src) return false;
  // /api/cache/images does its own processing — bypass Next.js optimizer.
  // /api/assets streams raw bytes — let Next.js optimize (WebP/AVIF, responsive srcset).
  // localPatterns in next.config.ts permits /api/assets/** for the optimizer.
  return src.startsWith(IMAGE_PROXY_PATH) || src.startsWith("data:");
}
```

**Step 4: Run tests to verify they pass**

Run: `bun run test -- __tests__/components/ui/logo-image.test.tsx --reporter=verbose`
Expected: PASS

**Step 5: Run type-check**

Run: `bun run type-check`
Expected: No errors

---

### Task 3: Remove `mounted` Gate for Card Grid — Pagination Component

**Files:**

- Modify: `src/components/features/bookmarks/bookmarks-with-pagination.client.tsx:255-303`

**Step 1: Restructure the card grid rendering**

Current structure (lines 255-303):

```
{!mounted && (skeleton grid)}
{mounted && error && (error state)}
{mounted && !error && filteredBookmarks.length === 0 && (empty state)}
{mounted && !error && filteredBookmarks.length > 0 && (real card grid)}
```

New structure — card grid always renders, `mounted` gates only interactive widgets:

```
{error && (error state)}                                    // no mounted gate
{!error && filteredBookmarks.length === 0 && (empty state)} // no mounted gate
{!error && filteredBookmarks.length > 0 && (real card grid)} // no mounted gate — SSR renders cards
```

The skeleton grid (lines 255-267) is removed entirely. Cards render on SSR with real data from SWR `fallbackData`.

Keep `mounted` gate on:

- Line 230: `{mounted && <BookmarkPaginationNav ... />}` — pagination nav (interactive)
- Lines 233-253: results count block — uses `toLocaleTimeString()` (locale-sensitive)
- Line 204: refresh button `style={{ visibility: mounted ? "visible" : "hidden" }}` — already uses CSS visibility, fine

**Step 2: Run validate**

Run: `bun run validate`
Expected: Clean (0 errors, 0 warnings)

---

### Task 4: Remove `mounted` Gate for Card Grid — Options Component

**Files:**

- Modify: `src/components/features/bookmarks/bookmarks-with-options.client.tsx:221-260`

**Step 1: Apply the same pattern as Task 3**

Current structure (lines 221-260):

```
{!mounted && (skeleton grid)}
{mounted && filteredBookmarks.length === 0 && (empty state)}
{mounted && filteredBookmarks.length > 0 && (real card grid)}
```

New structure:

```
{filteredBookmarks.length === 0 && (empty state)}
{filteredBookmarks.length > 0 && (real card grid)}
```

Remove skeleton grid (lines 221-231). Keep `mounted` gate on:

- Line 192: results count text block
- Line 130: refresh button visibility

**Step 2: Run validate**

Run: `bun run validate`
Expected: Clean

---

### Task 5: Update Image Handling Documentation

**Files:**

- Modify: `docs/architecture/image-handling.md`

**Step 1: Update the Image Optimization Decision Matrix**

Add a new row for `/api/assets` and update existing entries. The current matrix doesn't have an explicit row for `/api/assets`. Add:

```markdown
| `/api/assets/[assetId]` (Karakeep proxy) | N/A (local API route) | **No** | Yes (responsive) | Next.js `/_next/image` |
```

**Step 2: Update the `shouldBypassOptimizer` description in Canonical Helpers**

Update the `shouldBypassOptimizer` row description to reflect that `/api/assets` is no longer bypassed:

```markdown
| `shouldBypassOptimizer()` | `lib/utils/cdn-utils.ts` | Returns `true` for `/api/cache/images` routes and data URIs. `/api/assets` is excluded (optimized by Next.js). Use for `unoptimized` prop. |
```

**Step 3: Update the Logo `<Image>` behavior note (line 69)**

The note says "any other `/api/*` proxy" — narrow this to match reality. `/api/assets` no longer bypasses.

---

### Task 6: Full Verification

**Step 1: Run full validation suite**

Run: `bun run validate`
Expected: 0 errors, 0 warnings

**Step 2: Run all tests**

Run: `bun run test`
Expected: All passing

**Step 3: Run type-check**

Run: `bun run type-check`
Expected: No errors

**Step 4: Run build**

Run: `bun run build`
Expected: Successful build with no warnings about image optimization

**Step 5: Check file sizes**

Run: `bun run check:file-size`
Expected: No new violations (logo-image.client.tsx should be shorter after LQIP removal)

---

### Task 7: Commit

**Step 1: Stage changed files**

Files to include:

- `src/components/ui/logo-image.client.tsx`
- `src/lib/utils/cdn-utils.ts`
- `src/components/features/bookmarks/bookmarks-with-pagination.client.tsx`
- `src/components/features/bookmarks/bookmarks-with-options.client.tsx`
- `__tests__/components/ui/logo-image.test.tsx`
- `docs/architecture/image-handling.md`
- `docs/plans/2026-02-26-image-flickering-fix-design.md`
- `docs/plans/2026-02-26-image-flickering-fix-plan.md`

**Step 2: Commit with descriptive message**

```
fix: eliminate image flickering on bookmark cards

Replace dual-Image LQIP with Next.js native placeholder="blur",
remove mounted state gate for SSR card rendering, and enable
Next.js image optimization for /api/assets proxy URLs.
```

Wait for user confirmation before committing.
