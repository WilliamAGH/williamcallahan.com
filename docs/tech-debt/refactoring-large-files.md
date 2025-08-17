# Refactoring Plan: Files Exceeding 500 Lines

## Files Requiring Refactoring

### 1. `lib/s3-utils.ts` (1,095 lines) - HIGH PRIORITY
**Current Issues:**
- Significantly exceeds 500-line limit (2x over)
- Mix of read/write operations, caching, and utility functions
- Multiple responsibilities in single file

**Refactoring Strategy:**
```
lib/s3/
├── read.ts        (~250 lines) - All read operations
├── write.ts       (~250 lines) - All write operations  
├── cache.ts       (~200 lines) - Caching logic
├── utils.ts       (~150 lines) - Helper functions
├── constants.ts   (~50 lines)  - S3 paths and config
└── index.ts       (~50 lines)  - Re-exports
```

### 2. `lib/services/unified-image-service.ts` (1,034 lines) - HIGH PRIORITY  
**Current Issues:**
- Over 2x the recommended limit
- Handles multiple image sources and processing
- Complex caching and optimization logic

**Refactoring Strategy:**
```
lib/services/images/
├── sources/
│   ├── blog.ts      (~150 lines)
│   ├── bookmarks.ts (~150 lines)
│   └── projects.ts  (~150 lines)
├── processing/
│   ├── optimizer.ts (~200 lines)
│   └── validator.ts (~100 lines)
├── cache.ts         (~150 lines)
├── types.ts         (~50 lines)
└── index.ts         (~50 lines)
```

### 3. `lib/data-access/github.ts` (958 lines) - MEDIUM PRIORITY
**Current Issues:**
- Nearly 2x the limit
- Multiple GitHub API integrations
- Mixed concerns (repos, issues, PRs, etc.)

**Refactoring Strategy:**
```
lib/data-access/github/
├── repositories.ts  (~200 lines)
├── issues.ts       (~150 lines)
├── pull-requests.ts (~150 lines)
├── activity.ts     (~200 lines)
├── auth.ts         (~100 lines)
├── types.ts        (~100 lines)
└── index.ts        (~50 lines)
```

### 4. `lib/search.ts` (856 lines) - MEDIUM PRIORITY
**Current Issues:**
- Complex search indexing and querying
- Multiple search strategies
- Heavy caching logic

**Refactoring Strategy:**
```
lib/search/
├── indexer.ts      (~200 lines)
├── query.ts        (~200 lines)
├── strategies/
│   ├── fuzzy.ts    (~100 lines)
│   └── exact.ts    (~100 lines)
├── cache.ts        (~150 lines)
├── types.ts        (~50 lines)
└── index.ts        (~50 lines)
```

### 5. `next.config.ts` (829 lines) - LOW PRIORITY
**Current Issues:**
- Large configuration file
- Multiple webpack customizations
- Complex environment-specific logic

**Refactoring Strategy:**
```
config/next/
├── webpack.config.ts    (~300 lines)
├── headers.config.ts    (~150 lines)
├── redirects.config.ts  (~100 lines)
├── env.config.ts        (~100 lines)
├── images.config.ts     (~100 lines)
└── index.ts            (~100 lines) - Main next.config.ts
```

### 6. `components/features/bookmarks/bookmarks-with-pagination.client.tsx` (727 lines) - LOW PRIORITY
**Current Issues:**
- Large component with multiple responsibilities
- Complex state management
- Mixed UI and business logic

**Refactoring Strategy:**
```
components/features/bookmarks/
├── BookmarksList.tsx        (~200 lines)
├── BookmarkCard.tsx         (~150 lines)
├── BookmarkFilters.tsx      (~150 lines)
├── BookmarkPagination.tsx   (~100 lines)
├── hooks/
│   ├── useBookmarks.ts      (~100 lines)
│   └── useBookmarkFilters.ts (~50 lines)
└── index.tsx                (~50 lines)
```

## Implementation Guidelines

1. **Start with highest priority files** (s3-utils.ts, unified-image-service.ts)
2. **Create separate PRs** for each file refactoring
3. **Maintain backward compatibility** with re-exports
4. **Add comprehensive tests** before refactoring
5. **Update all imports** across the codebase
6. **Document new file structure** in architecture docs

## Success Criteria

- [ ] All files under 500 lines
- [ ] No functionality broken
- [ ] All tests passing
- [ ] Documentation updated
- [ ] Zero increase in bundle size
- [ ] Improved code organization

## Timeline

- Week 1-2: Refactor s3-utils.ts and unified-image-service.ts
- Week 3: Refactor github.ts and search.ts
- Week 4: Refactor remaining files
- Ongoing: Monitor for new files approaching limit

## Notes

- `data/investments.ts` (4,119 lines) is a data file, not code - consider moving to JSON or database
- The `.next/standalone` files are build artifacts and should not be refactored
- Consider implementing a pre-commit hook to warn when files exceed 400 lines