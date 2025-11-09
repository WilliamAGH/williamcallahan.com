# Bookmark Data Requirements

## Critical: Image Data Requirements by Use Case

### ⚠️ REGRESSION WARNING

**The most common regression in this codebase is missing images in UI components due to `includeImageData: false`**

### UI Components (MUST include image data)

These components display bookmarks to users and **REQUIRE** image data:

1. **RelatedContent Component**
   - Location: `components/features/related-content/`
   - Data sources:
     - `aggregateAllContent()` (precomputes preview metadata + best image URL)
     - Lightweight bookmark fetch via `getCachedBookmarks()` (strips heavy fields unless explicitly overridden)
   - Why: Displays bookmark thumbnails in "Discover Similar Content" section without duplicating raw bookmark blobs

2. **Bookmark Cards/Lists**
   - Any component rendering bookmark cards with visual previews
   - Must have access to `imageUrl`, `screenshot`, or logo data

### Build-Time Operations (can exclude image data)

These operations only need metadata and can safely use `includeImageData: false`:

1. **Sitemap Generation**
   - Location: `app/sitemap.ts`
   - Only needs URLs and slugs, not images
   - Can use lightweight bookmarks to reduce memory

2. **Slug Mapping Generation**
   - Only needs bookmark IDs and titles
   - Image data is unnecessary overhead

3. **Search Index Building**
   - Only needs text content for indexing
   - Images don't contribute to search

### Data Fetching Functions

#### Functions that MUST preserve image data

```typescript
// For UI display
aggregateAllContent(); // aggregator.ts - precomputes best image + description
// When a feature genuinely needs raw bookmark assets, call getCachedBookmarks({ includeImageData: true }) explicitly.
```

#### Functions that can strip image data

```typescript
// For slug generation only
getCachedBookmarkSlugs(); // request-cache.ts - uses lightweight bookmarks

// For sitemap generation
getBookmarksForStaticBuildAsync(); // can strip images for memory efficiency
```

## Common Regression Pattern

### The Problem

1. Developer sees memory usage during build
2. Adds `includeImageData: false` to optimize
3. UI components lose their images
4. Users report missing thumbnails

### The Solution

- **NEVER** change `includeImageData` without understanding all consumers
- **ALWAYS** check if the data is used for UI display
- **DOCUMENT** why image data is included/excluded

## Testing Checklist

Before changing any `includeImageData` parameter:

- [ ] Check all consumers of the function
- [ ] Verify if any UI components use this data
- [ ] Test RelatedContent section on bookmark/blog pages
- [ ] Ensure bookmark cards show images
- [ ] Run build to verify sitemap still generates

## Architecture Principles

1. **Separate concerns**: Different functions for different purposes
   - UI display functions: Include all data
   - Build-time functions: Optimize for memory

2. **Type safety**: Use TypeScript to enforce image data presence

   ```typescript
   type BookmarkWithImages = UnifiedBookmark & {
     imageUrl: string | undefined;
     screenshot?: string;
   };
   ```

3. **Clear naming**: Function names should indicate data completeness
   - `getBookmarksForDisplay()` - includes everything
   - `getBookmarksForSlugs()` - minimal data

## Related Files

- `lib/bookmarks/request-cache.ts` - Request-scoped caching
- `lib/content-similarity/aggregator.ts` - Content aggregation
- `components/features/related-content/` - RelatedContent display
- `app/sitemap.ts` - Sitemap generation
