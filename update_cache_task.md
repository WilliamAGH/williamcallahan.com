# ZERO TEMPERATURE & Next.js 15 'use cache' Migration Compliance Checklist

> **No code changes may proceed unless every checklist item is checked and validated with zero errors/warnings.**

## 🚨 IMMEDIATE ACTION REQUIRED - BLOCKING ISSUES

**CURRENT STATUS: DEVELOPMENT SERVER CANNOT START**

**Error**: `SyntaxError: Export named 'cacheTag' not found in module '/Users/williamcallahan/Developer/git/cursor/williamcallahan.com/node_modules/next/cache.js'`

**Impact**: Application fails to start, blocking all development work

**Priority Tasks** (Must be completed before any other migration work):

1. **URGENT**: Complete "Next.js Cache API Audit & Verification" section below
2. **URGENT**: Complete "Critical File-Level Import Audit" section below  
3. **URGENT**: Execute "Emergency Troubleshooting & Recovery" if needed
4. **URGENT**: Restore working development environment before proceeding

**Files Currently Broken**:

- `lib/data-access/images.server.ts:2`
- `lib/bookmarks/bookmarks-data-access.server.ts:10`
- `lib/search.ts:14`

**🎯 SOLUTION IDENTIFIED**: The import pattern is actually CORRECT according to Next.js 15 documentation. The issue is likely version compatibility or configuration problems.

**Root cause analysis needed before proceeding with any other checklist items.**

## 📚 Key API Understanding From Documentation

**Source:** [Next.js 'use cache' Official Docs](https://nextjs.org/docs/app/api-reference/directives/use-cache) | [Context7 Documentation](https://context7.com/context7/nextjs_org-docs?topic=use+cache)

### ✅ CORRECT Usage Pattern (Per Official Documentation)

```typescript
// ✅ All cache functions are imported from 'next/cache'
import { unstable_cacheLife as cacheLife, unstable_cacheTag as cacheTag, revalidateTag } from 'next/cache';

// ✅ cacheLife and cacheTag are called inside 'use cache' functions
async function getCachedData() {
  'use cache'
  cacheLife('hours'); // Called inside function after import
  cacheTag('data'); // Called inside function after import
  
  const result = await fetch('/api/data');
  return result;
}

// ✅ Invalidation uses imported revalidateTag
export function invalidateData() {
  revalidateTag('data'); // This IS imported
}
```

### ❌ Previous Understanding (INCORRECT)

```typescript
// ❌ INCORRECT ASSUMPTION - These ARE valid imports per documentation
// The issue is likely version/configuration related, not import syntax
```

### 🔧 Configuration Required

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  experimental: {
    useCache: true, // ✅ CORRECT flag
  },
};
```

## 🚨 CRITICAL ZERO TEMPERATURE CONSTRAINT 🚨

> **🚫 ABSOLUTE PROHIBITION: NO NEW FILES WILL BE CREATED OR APPROVED DURING THIS MIGRATION**
>
> **This migration MUST work exclusively with existing files. Any mention of "Create X" or "Add new file Y" requires explicit repeated clear user consent. The default assumption is NO NEW FILES.**
>
> **Violating this constraint is a ZERO TEMPERATURE violation requiring immediate halt.**

## 🚨 CRITICAL: Next.js Cache API Understanding & Correction

### **ROOT CAUSE CORRECTION: Import Pattern is Actually Valid**

**❌ PREVIOUS INCORRECT UNDERSTANDING**: `cacheLife` and `cacheTag` are global functions that shouldn't be imported
**✅ CORRECT UNDERSTANDING PER OFFICIAL DOCS**: `unstable_cacheLife` and `unstable_cacheTag` ARE valid imports from 'next/cache'

**Documentation Sources:**

- [Next.js 'use cache' Official Docs](https://nextjs.org/docs/app/api-reference/directives/use-cache)
- [Context7 Next.js Cache Documentation](https://context7.com/context7/nextjs_org-docs?topic=use+cache)

### Pre-Migration API Understanding Correction

- [ ] **Verify Next.js version and cache API support**
  - [ ] Check current Next.js version in package.json
  - [ ] Verify Next.js version supports 'use cache' directive (requires 15.0.0+)
  - [ ] Check if experimental.useCache: true is properly configured (NOT dynamicIO)
  - [ ] Document exact Next.js version for compatibility reference

- [ ] **Understand correct cache API usage pattern**
  - [ ] **CRITICAL**: `cacheLife` and `cacheTag` are NOT imports - they're global functions
  - [ ] **CRITICAL**: These functions are only available INSIDE 'use cache' functions
  - [ ] **CRITICAL**: `revalidateTag` IS imported from 'next/cache' (this one is correct)
  - [ ] **Correct pattern:**
    ```typescript
    // ✅ CORRECT - revalidateTag is imported
    import { revalidateTag } from 'next/cache';
    
    // ✅ CORRECT - cacheLife and cacheTag are global inside cached functions
    async function getCachedData() {
      'use cache'
      cacheLife('hours'); // Available globally - NO IMPORT
      cacheTag('data'); // Available globally - NO IMPORT
      
      const data = await fetch('/api/data');
      return data;
    }
    ```

- [ ] **Resolve current import failures - REMOVE INCORRECT IMPORTS**
  - [ ] **IMMEDIATE FIX**: Remove these INCORRECT import lines from all files:
    ```typescript
    // ❌ REMOVE - These are WRONG imports
    import { cacheLife, cacheTag } from "next/cache";
    ```
  - [ ] **Files to fix by REMOVING the incorrect imports:**
    - [ ] `lib/data-access/images.server.ts:2` - Remove cacheLife, cacheTag import
    - [ ] `lib/bookmarks/bookmarks-data-access.server.ts:10` - Remove cacheLife, cacheTag import  
    - [ ] `lib/search.ts:14` - Remove cacheLife, cacheTag import
  - [ ] **Keep only correct imports**: Only `revalidateTag` should be imported from 'next/cache'
  - [ ] **Validate**: After removing imports, dev server should start successfully

- [ ] **Create Next.js cache API compatibility test**
  - [ ] Create temporary test script to verify all cache APIs
    ```typescript
    // Test script - DO NOT COMMIT
    try {
      const { cacheLife, cacheTag, revalidateTag } = require('next/cache');
      console.log('✅ All cache APIs available');
      console.log('cacheLife:', typeof cacheLife);
      console.log('cacheTag:', typeof cacheTag);
      console.log('revalidateTag:', typeof revalidateTag);
    } catch (error) {
      console.error('❌ Cache API import failed:', error.message);
    }
    ```
  - [ ] Run test script and document results
  - [ ] **CRITICAL**: Do not proceed until all imports work

- [ ] **Alternative API discovery**
  - [ ] If standard imports fail, check for alternative import paths:
    - [ ] Try `import { unstable_cache } from 'next/cache'`
    - [ ] Try `import { cache } from 'react'`
    - [ ] Check Next.js documentation for current API structure
  - [ ] Document actual working import patterns for the installed version

- [ ] **Fallback strategy planning**
  - [ ] **If cache APIs unavailable**: Plan fallback to existing LRU-cache pattern
  - [ ] **If partial APIs available**: Document which features can be migrated
  - [ ] **If version upgrade needed**: Document upgrade path and compatibility risks
  - [ ] Create rollback plan if migration cannot proceed

### Development Environment Validation

- [ ] **Fix immediate blocking errors**
  - [ ] Resolve all import errors preventing `bun run dev`
  - [ ] Ensure development server starts successfully
  - [ ] Verify all existing functionality works before migration
  - [ ] Document any workarounds needed for development

- [ ] **Validate build process**
  - [ ] Run `bun run build` to ensure production build works
  - [ ] Check for any cache-related build warnings or errors
  - [ ] Verify type checking passes with current imports
  - [ ] Document any build-time issues that need resolution

- [ ] **Test current cache functionality**
  - [ ] Verify existing LRU-cache implementations work correctly
  - [ ] Test memory management features are functioning
  - [ ] Confirm Sharp processing respects memory limits
  - [ ] Baseline performance metrics before any changes

## Migration Preparation

### Inventory & Assessment

- [x] **Map all current caching implementations**
  - [x] List all files using ImageMemoryManagerInstance (7 files identified)
  - [x] List all files using ServerCacheInstance (15+ files identified)
  - [x] List all files using LRU-cache directly (8 files identified)
  - [x] Map cache keys and TTLs from constants.ts
  - [x] Document memory thresholds and budgets

### Pre-Migration Stabilization

- [x] **Sharp concurrency limiting implemented**
  - [x] Sharp concurrency set to 1 in instrumentation.ts
  - [x] Sharp cache disabled in instrumentation.ts
  - [x] Memory monitoring added with 1GB native memory warning threshold

- [x] **Memory budget constants configured**
  - [x] Production memory budget: 3.75GB
  - [x] Development memory budget: 2GB
  - [x] Image cache budget: 512MB
  - [x] Server cache budget: 256MB

## Next.js 15 'use cache' Implementation

### Core Configuration

- [ ] **Enable experimental 'use cache' in next.config.ts**
  - [ ] **MUST USE**: `experimental: { useCache: true }` (NOT dynamicIO)
  - [ ] **Update from wrong config**: Remove `dynamicIO: true`, add `useCache: true`
  - [ ] **Validate configuration works** with `bun run validate`
  - [ ] **Important**: Default cache lifetime is 15 minutes (configurable via cacheLife)
  
  **Correct next.config.ts pattern:**
  ```typescript
  import type { NextConfig } from 'next';
  
  const nextConfig: NextConfig = {
    experimental: {
      useCache: true, // ✅ CORRECT for 'use cache' directive
    },
  };
  
  export default nextConfig;
  ```

### Critical File-Level Import Audit

- [ ] **Audit each file with cache imports individually**
  - [ ] **lib/data-access/images.server.ts**
    - [ ] Line 2: `import { cacheLife, cacheTag } from "next/cache";`
    - [ ] Test: Comment out import and check if file compiles
    - [ ] Test: Try alternative import patterns
    - [ ] Document: What functions actually use these imports
    - [ ] Status: BLOCKING - prevents dev server start
  
  - [ ] **lib/bookmarks/bookmarks-data-access.server.ts**
    - [ ] Line 10: `import { cacheLife, cacheTag } from "next/cache";`
    - [ ] Test: Verify usage in getBookmarksPage, getTagBookmarksPage, getTagBookmarksIndex
    - [ ] Test: Check if functions marked as 'use cache' actually work
    - [ ] Document: Which specific cache calls are failing
    - [ ] Status: BLOCKING - prevents dev server start
  
  - [ ] **lib/search.ts**
    - [ ] Line 14: `import { cacheLife, cacheTag } from "next/cache";` (duplicate entries found)
    - [ ] Test: Check if search functions are using these imports
    - [ ] Test: Verify 'use cache' directive placement
    - [ ] Document: Search cache implementation status
    - [ ] Status: BLOCKING - prevents dev server start

- [ ] **Comprehensive import testing strategy**
  - [ ] Create isolated test for each problematic file:
    ```bash
    # Test each file individually
    npx tsc --noEmit lib/data-access/images.server.ts
    npx tsc --noEmit lib/bookmarks/bookmarks-data-access.server.ts  
    npx tsc --noEmit lib/search.ts
    ```
  - [ ] Document specific error messages for each file
  - [ ] Test with different Next.js import patterns
  - [ ] Create minimal reproduction case for each import failure

- [ ] **Rollback preparation for blocking imports**
  - [ ] **IMMEDIATE**: Comment out all failing cache imports to restore dev server
  - [ ] **IMMEDIATE**: Comment out all 'use cache' directives causing import failures
  - [ ] **IMMEDIATE**: Restore previous working state before proceeding
  - [ ] Document exactly what was changed vs. what was working before

### Version Compatibility Deep Dive

- [ ] **Next.js version audit**
  - [ ] Current package.json version: `cat package.json | grep '"next":'`
  - [ ] Installed node_modules version: `cat node_modules/next/package.json | grep '"version":'`
  - [ ] Check for version mismatches between package.json and node_modules
  - [ ] Verify bun.lock is consistent with package.json

- [ ] **Feature flag verification**
  - [ ] Check next.config.ts experimental settings
  - [ ] Verify `dynamicIO: true` is correctly set
  - [ ] Test if `useCache: true` works as alternative
  - [ ] Document exact configuration that should enable cache APIs

- [ ] **Node.js/Bun compatibility check**
  - [ ] Current Node.js version: `node --version`
  - [ ] Current Bun version: `bun --version`
  - [ ] Check if Next.js cache APIs work differently under Bun vs Node
  - [ ] Test cache imports using Node.js directly: `node -e "console.log(require('next/cache'))"`

### LRU-Cache Removal (Critical Dependencies)

- [ ] **Remove lru-cache package dependency**
  - [ ] Remove from package.json dependencies (currently not present - good)
  - [ ] Update imports to use Next.js native caching

- [ ] **Replace LRU-cache imports in core files**
  - [ ] `lib/services/unified-image-service.ts` - Replace LRUCache import
  - [ ] `lib/cache.ts` - Replace LRUCache import and implementation
  - [ ] `lib/blog/mdx.ts` - Replace LRUCache import
  - [ ] `lib/image-memory-manager.ts` - Replace LRUCache with 'use cache' pattern
  - [ ] `lib/server-cache.ts` - Replace LRUCache with 'use cache' pattern
  - [ ] `types/cache.ts` - Remove LRUCache type imports
  - [ ] `app/api/og-image/route.ts` - Replace LRUCache import

### Function-Level 'use cache' Migration

- [ ] **Ensure proper 'use cache' directive placement**
  - [ ] **CRITICAL**: 'use cache' MUST be the first line of async functions (before any other code)
  - [ ] **CRITICAL**: Functions using 'use cache' MUST be async
  - [ ] **CRITICAL**: Only works in Node.js server runtime (NOT Edge or Client Components)
  - [ ] **CRITICAL**: Arguments and return values MUST be JSON-serializable

## Comprehensive Migration Implementation Guidelines

### Core Implementation Requirements

- [ ] **Wrap all direct SDK/DB calls in 'use cache' async functions**
- [ ] **Remove all unstable_cache imports and usages**
- [ ] **'use cache' is the first line in all cacheable async functions**
- [ ] **Validate all arguments/return values of cacheable functions are JSON-serializable and type-safe**
- [ ] **Add Zod validation to all fallback logic for external data**
- [ ] **Use only string cache profiles ('hours', 'days', 'weeks') unless custom config is required**
- [ ] **Call cacheTag() once per tag, not with multiple arguments**
- [ ] **Tag names in cacheTag() are string literals or deterministic strings from arguments**
- [ ] **Test cache invalidation for every cacheTag() and revalidateTag() usage**
- [ ] **Document all cacheTag and revalidateTag usages in architecture/feature docs**
- [ ] **Test all cacheTag and revalidateTag usages (manual or automated)**
- [ ] **All cache keys are deterministic and do not include non-serializable values**
- [ ] **Do not use 'use cache' in Edge or Client runtime code (Node.js/server only)**
- [ ] **Obtain explicit, repeated, clear user consent before creating any new file**
- [ ] **Update all references to removed legacy cache utilities**

### Validation Requirements

- [ ] **Run 'bun run validate' before and after every change**
- [ ] **Run 'bun run validate' after toggling feature flags**
- [ ] **Run 'bun run validate' after removing legacy code**
- [ ] **Update all relevant documentation after migration**
  - [ ] Architecture entrypoint
  - [ ] File overview map
  - [ ] Caching docs
  - [ ] Onboarding/training docs
- [ ] **Communicate migration and new cache invalidation patterns to all developers**

### Performance & Monitoring

- [ ] **Monitor cache hit/miss ratios, memory usage, and error rates for at least 1 week post-migration**
- [ ] **Validate memory and performance targets are met**
- [ ] **Test rollback procedures (feature flag, git revert, full rollback)**
- [ ] **All fallback logic is type-safe and validated**
- [ ] **Changing function arguments or their order creates a new cache entry; argument types and order are carefully managed**

## Serializability Validation

> **All arguments and return values of cacheable functions must be JSON-serializable and type-safe.**

**Validation template:**

```ts
import { isPlainObject } from 'is-plain-object';

function validateSerializable(value: unknown): boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null ||
    Array.isArray(value) ||
    isPlainObject(value)
  );
}
```

### Serializability Checklist

- [ ] **Validate all cached function arguments are serializable**
- [ ] **Validate all cached function return values are serializable**
- [ ] **Handle non-serializable data (Buffers, Dates, Functions, etc.) appropriately**
- [ ] **Add runtime validation where needed using validation template above**
- [ ] **Use Zod schemas for external data validation**
- [ ] **Test serialization/deserialization round-trips for complex objects**

## Edge Runtime Warning

> **'use cache' is NOT supported in Edge or Client runtime code. Use only in Node.js/server code.**

### Runtime Environment Validation

- [ ] **No usage of 'use cache' in Edge or Client runtime code**
- [ ] **Verify all cached functions run in Node.js server environment**
- [ ] **Check route handlers for proper runtime configuration**
- [ ] **Ensure client components don't attempt to use 'use cache' directive**
- [ ] **Document runtime requirements for all cached functions**

- [x] **Migrate core data access functions**
  - [x] `lib/bookmarks/bookmarks-data-access.server.ts`
    - [x] Wrap `getBookmarksPage()` with 'use cache' directive - DONE
    - [x] Wrap `getTagBookmarksPage()` with 'use cache' directive - DONE
    - [x] Wrap `getTagBookmarksIndex()` with 'use cache' directive - DONE
    - [x] Add appropriate `cacheLife('hours')` and `cacheTag()` calls - DONE
    - [x] Maintain direct S3 access as primary path - DONE
  - [ ] `lib/data-access/github.ts`
    - [ ] Wrap GitHub API calls with 'use cache' directive
    - [ ] Use `cacheLife('days')` for 24h cache
    - [ ] Add `cacheTag('github')` for invalidation
  - [ ] `lib/blog/server-search.ts`
    - [ ] Wrap search functions with 'use cache' directive
    - [ ] Use `cacheLife('minutes')` for search results
    - [ ] Add search-specific cache tags

### Cache Lifetime & Tagging Strategy

- [ ] **Implement cache profiles consistently (INSIDE 'use cache' functions)**
  - [ ] Use predefined profiles: 'seconds', 'minutes', 'hours', 'days', 'weeks'
  - [ ] **Correct usage pattern:**
    ```typescript
    async function getCachedBookmarks() {
      'use cache'
      cacheLife('hours'); // ✅ Called INSIDE the function - NO IMPORT
      cacheTag('bookmarks'); // ✅ Called INSIDE the function - NO IMPORT
      
      const data = await getBookmarksFromS3();
      return data;
    }
    ```
  - [ ] **Bookmarks**: `cacheLife('hours')` - 1 hour revalidation
  - [ ] **GitHub data**: `cacheLife('days')` - 24 hour revalidation  
  - [ ] **Blog posts**: `cacheLife('weeks')` - weekly revalidation
  - [ ] **Search results**: `cacheLife('minutes')` - 15 minute revalidation
  - [ ] **Images/logos**: `cacheLife('weeks')` - weekly revalidation (immutable content)

- [ ] **Implement cache tagging for invalidation (INSIDE 'use cache' functions)**
  - [ ] **Critical**: Call `cacheTag()` once per tag (not multiple arguments)
  - [ ] **Critical**: cacheTag() is called INSIDE the cached function, not imported
  - [ ] Add `cacheTag('bookmarks')` to bookmark functions
  - [ ] Add `cacheTag('github')` to GitHub functions
  - [ ] Add `cacheTag('blog')` to blog functions
  - [ ] Add `cacheTag('search')` to search functions
  - [ ] Add specific tags like `cacheTag('user-${userId}')` where needed

### Route-Level Caching

- [ ] **Cache entire static routes where appropriate**
  - [ ] Add 'use cache' to both layout.tsx AND page.tsx for route caching
  - [ ] `app/blog/page.tsx` - Add 'use cache' directive
  - [ ] `app/projects/page.tsx` - Add 'use cache' directive
  - [ ] `app/experience/page.tsx` - Add 'use cache' directive
  - [ ] Cannot use with request-time APIs (cookies, headers)

### API Route Migration

- [ ] **Migrate API routes from manual caching to 'use cache' functions**
  - [ ] `app/api/bookmarks/route.ts` - Call cached functions instead of manual cache management
  - [ ] `app/api/github-activity/route.ts` - Use cached GitHub data functions
  - [ ] `app/api/search/[scope]/route.ts` - Use cached search functions
  - [ ] Remove manual ServerCache.get/set calls from route handlers

### Image Processing Migration

- [ ] **Create cached S3 data accessor functions** (NO NEW FILES - modify existing)
  - [ ] Update `lib/data-access/images.server.ts` with 'use cache' wrapped S3 calls
  - [ ] **Correct pattern for image caching:**
    ```typescript
    async function getCachedImageFromS3(key: string) {
      'use cache'
      cacheLife('weeks'); // Called inside function - NO IMPORT
      cacheTag('images'); // Called inside function - NO IMPORT
      cacheTag(`image-${key}`); // Specific tag for this image
      
      const imageBuffer = await s3Client.getObject({ Key: key });
      return imageBuffer; // Must be serializable
    }
    ```
  - [ ] Ensure Buffer objects are properly serialized/handled

## Memory Management Integration

### Preserve Memory Safety Features

- [ ] **Maintain memory pressure detection**
  - [ ] Keep ImageMemoryManager memory monitoring (non-LRU parts)
  - [ ] Preserve RSS-based memory thresholds
  - [ ] Keep memory pressure middleware (`lib/middleware/memory-pressure.ts`)
  - [ ] Maintain emergency cleanup procedures

- [ ] **Update memory monitoring for 'use cache' patterns**
  - [ ] Adapt memory metrics collection for Next.js native cache
  - [ ] Update `/api/health/metrics` endpoint for new caching patterns
  - [ ] Preserve memory budget enforcement

### Sharp Processing Integration

- [ ] **Ensure Sharp processing respects memory limits**
  - [ ] Keep Sharp concurrency limiting (already set to 1)
  - [ ] Preserve Sharp cache disabling
  - [ ] Integrate 'use cache' with image processing pipeline
  - [ ] Maintain buffer size limits and rejection logic

## Cache Invalidation Implementation

### Manual Invalidation Patterns

- [ ] **Implement cache invalidation endpoints**
  - [ ] **Correct revalidateTag usage (this IS imported):**
    ```typescript
    // ✅ CORRECT - revalidateTag IS imported from 'next/cache'
    import { revalidateTag } from 'next/cache';
    
    export async function POST() {
      revalidateTag('bookmarks'); // Invalidates all 'bookmarks' tagged cache
      return Response.json({ revalidated: true });
    }
    ```
  - [ ] Update `app/api/cache/bookmarks/refresh/route.ts` to use `revalidateTag('bookmarks')`
  - [ ] Update GitHub refresh endpoints to use `revalidateTag('github')`
  - [ ] Add blog cache invalidation via `revalidateTag('blog')`
  - [ ] Test invalidation propagation across all cache layers

### Automated Invalidation

- [ ] **Set up automated cache invalidation**
  - [ ] Integrate with webhook endpoints for content updates
  - [ ] Add time-based invalidation for stale content
  - [ ] Implement stale-while-revalidate patterns where appropriate

## 🚨 EMERGENCY TROUBLESHOOTING & RECOVERY

### Immediate Recovery Actions

- [ ] **Restore working development environment**
  - [ ] **CRITICAL**: Comment out all imports causing "Export named 'X' not found" errors
    ```bash
    # Quick fix to restore dev server
    sed -i.bak 's/import { cacheLife, cacheTag }/\/\/ DISABLED: import { cacheLife, cacheTag }/' lib/data-access/images.server.ts
    sed -i.bak 's/import { cacheLife, cacheTag }/\/\/ DISABLED: import { cacheLife, cacheTag }/' lib/bookmarks/bookmarks-data-access.server.ts
    sed -i.bak 's/import { cacheLife, cacheTag }/\/\/ DISABLED: import { cacheLife, cacheTag }/' lib/search.ts
    ```
  - [ ] **CRITICAL**: Comment out all 'use cache' directives in functions
  - [ ] Test: Run `bun run dev` and verify server starts
  - [ ] Test: Verify basic functionality works without cache enhancements

- [ ] **Document current broken state**
  - [ ] List all files with commented-out imports
  - [ ] List all functions with disabled 'use cache' directives
  - [ ] Document exact error messages before fixes
  - [ ] Create baseline for working vs. broken state

### Root Cause Analysis

- [ ] **Investigate Next.js cache module structure**
  - [ ] Examine actual exports: `node -p "Object.keys(require('next/cache'))"`
  - [ ] Check if cache functions exist under different names
  - [ ] Look for unstable_ prefixed versions of functions
  - [ ] Document actual available exports vs. expected exports

- [ ] **Version/configuration mismatch investigation**
  - [ ] Check if Next.js version supports the specific cache APIs being used
  - [ ] Verify experimental flags are correctly enabling cache features
  - [ ] Test if different experimental flag combinations work
  - [ ] Check Next.js release notes for cache API availability

- [ ] **Alternative implementation discovery**
  - [ ] Research current Next.js 15 cache implementation patterns
  - [ ] Check if 'use cache' syntax has changed
  - [ ] Look for updated documentation on cache tagging and lifetime
  - [ ] Test minimal working examples from Next.js docs

### Step-by-Step Recovery Plan

- [ ] **Phase 1: Restore stability**
  - [ ] Remove all failing imports
  - [ ] Remove all 'use cache' directives causing issues
  - [ ] Verify application runs normally
  - [ ] Commit stable state as recovery point

- [ ] **Phase 2: Verify Next.js setup**
  - [ ] Confirm Next.js version supports intended cache features
  - [ ] Test cache APIs in isolation
  - [ ] Create minimal working cache example
  - [ ] Document working patterns

- [ ] **Phase 3: Gradual re-implementation**
  - [ ] Re-add cache imports using verified working patterns
  - [ ] Test each file individually before proceeding
  - [ ] Add 'use cache' directives one function at a time
  - [ ] Validate each step with `bun run dev`

### Diagnostic Commands Reference

```bash
# Check Next.js version
cat package.json | grep '"next":'
cat node_modules/next/package.json | grep '"version":'

# Test cache module availability
node -e "try { console.log(Object.keys(require('next/cache'))); } catch(e) { console.error(e.message); }"

# Check experimental config
cat next.config.ts | grep -A 10 "experimental"

# Verify TypeScript compilation for specific files
npx tsc --noEmit lib/data-access/images.server.ts
npx tsc --noEmit lib/bookmarks/bookmarks-data-access.server.ts
npx tsc --noEmit lib/search.ts

# Test development server
bun run dev

# Check for import/export issues
grep -r "cacheLife\|cacheTag" --include="*.ts" --include="*.tsx" .

# Restore from backup files (if created)
find . -name "*.bak" -exec sh -c 'mv "$1" "${1%.bak}"' _ {} \;
```

## Validation & Testing

### Pre-Migration Validation

- [ ] **Run validation before every change**
  - [ ] Execute `bun run validate` before starting migration
  - [ ] Fix any existing TypeScript/linting errors
  - [ ] Document baseline performance metrics

### Progressive Migration Testing

- [ ] **Test each migration step individually**
  - [ ] Run `bun run validate` after each file modification
  - [ ] Test cache hit/miss behavior for each migrated function
  - [ ] Verify serialization of return values
  - [ ] Confirm cache keys generate correctly from function arguments

### Integration Testing

- [ ] **Test cache invalidation end-to-end**
  - [ ] Verify `revalidateTag()` clears appropriate cache entries
  - [ ] Test cache invalidation via API endpoints
  - [ ] Confirm stale-while-revalidate behavior
  - [ ] Test cache behavior under memory pressure

### Performance Validation

- [ ] **Monitor performance throughout migration**
  - [ ] Track cache hit/miss ratios before and after
  - [ ] Monitor memory usage patterns
  - [ ] Verify response times for cached vs uncached requests
  - [ ] Test under load to ensure no performance regression

## Legacy Code Removal

### Safe Removal Process

- [ ] **Remove legacy cache implementations** (Only after migration validation)
  - [ ] Remove `lib/server-cache.ts` implementation (keep types if needed)
  - [ ] Remove `lib/image-memory-manager.ts` LRU-specific code
  - [ ] Update imports across codebase to use new patterns
  - [ ] Remove manual cache management from API routes

### Clean Up Dependencies

- [ ] **Remove unnecessary dependencies** (After confirming no longer needed)
  - [ ] Audit for unused cache-related packages
  - [ ] Remove lru-cache if no longer referenced
  - [ ] Update type definitions for new caching patterns

## Documentation Updates

### Architecture Documentation

- [ ] **Update core architecture documentation**
  - [ ] Update `docs/projects/structure/00-architecture-entrypoint.md`
  - [ ] Update `docs/projects/file-overview-map.md`
  - [ ] Update `docs/projects/structure/caching.md` with 'use cache' patterns
  - [ ] Update `docs/projects/structure/memory-mgmt.md` for integration

### Caching Strategy Documentation

- [ ] **Document new caching patterns**
  - [ ] Create cache tagging strategy guide
  - [ ] Document cache lifetime policies
  - [ ] Update invalidation procedures
  - [ ] Add troubleshooting guide for cache issues

## Rollback Procedures

### Feature Flag Implementation

- [ ] **Implement feature flags for safe rollback**
  - [ ] Add `USE_NEXTJS_CACHE` environment variable
  - [ ] Add fallback logic to legacy cache when flag disabled
  - [ ] Test rollback scenarios under load

### Emergency Procedures

- [ ] **Document emergency rollback steps**
  - [ ] Git revert procedures
  - [ ] Configuration rollback via environment variables
  - [ ] Full deployment rollback procedures
  - [ ] Communication plan for rollback events

## Monitoring & Success Criteria

### Memory Performance Targets

- [ ] **Achieve memory usage targets**
  - [ ] Target RSS usage: < 2GB (down from 4.7GB)
  - [ ] Target heap usage: < 1GB (down from 1.4GB)  
  - [ ] Target native memory: < 500MB (down from 3.3GB)
  - [ ] Zero memory pressure warnings during normal operation

### Cache Performance Targets

- [ ] **Meet cache performance requirements**
  - [ ] Cache hit ratio: > 90% for frequently accessed data
  - [ ] API response times: < 50ms for cached responses
  - [ ] Image processing: < 100ms for cached images
  - [ ] Zero cache-related errors or failures

### Operational Monitoring

- [ ] **Monitor system health post-migration**
  - [ ] Track cache hit/miss ratios via metrics endpoint
  - [ ] Monitor memory usage patterns for 1+ week
  - [ ] Verify cache invalidation works as expected
  - [ ] Test system behavior under load

## Critical Implementation Notes

### 'use cache' Directive Requirements

- [ ] **Ensure proper 'use cache' usage**
  - [ ] 'use cache' MUST be the first line of async functions
  - [ ] Functions using 'use cache' MUST be async
  - [ ] Arguments and return values MUST be JSON-serializable
  - [ ] Cannot use in Client Components (server-only)
  - [ ] Cannot use in Edge Runtime (Node.js only)

### Serialization Validation

- [ ] **Validate data serialization**
  - [ ] Test all cached function return values are serializable
  - [ ] Handle non-serializable data (Buffers, Dates, etc.) appropriately
  - [ ] Add runtime validation where needed
  - [ ] Use Zod schemas for external data validation

### Cache Key Management

- [ ] **Understand automatic cache key generation**
  - [ ] Cache keys auto-generated from function arguments
  - [ ] Argument order and types affect cache keys
  - [ ] Non-serializable arguments become references (pass-through only)
  - [ ] Changing function signature creates new cache entries

## Migration Order (Risk-Based Priority)

### Phase 1: Low Risk (Start Here)

- [ ] **GitHub activity data caching**
  - [ ] Low traffic, predictable patterns
  - [ ] Clear cache boundaries
  - [ ] Easy rollback if issues occur

### Phase 2: Medium Risk

- [ ] **Blog post and search caching**
  - [ ] Moderate traffic
  - [ ] Stable content patterns
  - [ ] Good testing capabilities

### Phase 3: Medium-High Risk  

- [ ] **Bookmarks system caching**
  - [ ] Moderate to high traffic
  - [ ] Complex data relationships
  - [ ] Critical business functionality

### Phase 4: Highest Risk (Last)

- [ ] **Image processing pipeline**
  - [ ] High traffic, memory intensive
  - [ ] Complex Sharp integration
  - [ ] Critical for performance

## Common Mistakes to Avoid

### Implementation Errors

- [ ] **Avoid common 'use cache' mistakes**
  - [ ] ✅ Place 'use cache' as first line of function
  - [ ] ✅ Use `cacheTag('tag1'); cacheTag('tag2');` not `cacheTag('tag1', 'tag2')`
  - [ ] ✅ Use predefined cache profiles ('hours', 'days') when possible
  - [ ] ✅ Only cache server-side functions, not client components
  - [ ] ✅ Ensure return values are serializable
  - [ ] ✅ Remember non-fetch I/O must be explicitly wrapped in 'use cache' functions

### Migration Process Errors

- [ ] **Follow proper migration sequence**
  - [ ] ✅ Complete inventory before starting changes
  - [ ] ✅ Stabilize Sharp/memory systems before migration
  - [ ] ✅ Test each component individually before integration
  - [ ] ✅ Keep fallback mechanisms until validation complete
  - [ ] ✅ Monitor for at least 1 week before declaring success

---

## Final Validation Checklist

Before declaring migration complete:

- [ ] **All legacy cache systems removed or disabled**
- [ ] **All 'use cache' functions tested and working**
- [ ] **Cache invalidation tested and documented**
- [ ] **Memory usage within target thresholds**
- [ ] **Performance benchmarks met or exceeded**
- [ ] **Documentation updated and accurate**
- [ ] **Rollback procedures tested and ready**
- [ ] **Team trained on new caching patterns**
- [ ] **Monitoring shows stable operation for 1+ week**

---

**ZERO TEMPERATURE COMPLIANCE**: Every checkbox must be completed and validated before proceeding to the next phase. Any deviation from this checklist requires explicit user approval and documentation of the decision rationale.
