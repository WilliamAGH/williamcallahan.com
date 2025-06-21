# Comprehensive Memory Usage Analysis Report

**Date:** 2025-06-20
**Author:** Cline

## 1. Executive Summary

This report details an investigation into the remaining sources of high memory usage in the Next.js 15 application. The analysis confirms that the recent (June 2025) memory management refactoring, centered around the `ImageMemoryManager`, has successfully addressed the most critical issues related to image buffer handling.

However, a significant vulnerability remains: the primary `ServerCache` is **not size-aware**. It relies on an item count limit and a long TTL (30 days), creating a risk of unbounded memory growth from large JSON objects.

The investigation has identified two primary drivers of this risk:

1. **OpenGraph Data Caching**: Stores a potentially large metadata object for every unique URL, with a 7-day TTL. This is the highest-risk area.
2. **GitHub Activity Caching**: Stores a large, comprehensive data object representing years of user activity, with a 24-hour TTL.

This report recommends re-architecting the `ServerCache` to be size-aware, similar to the `ImageMemoryManager`, to eliminate this class of memory issues.

## 2. Investigation Details

The analysis was conducted iteratively, starting from the architectural documentation and progressively examining key components of the memory and caching systems.

### 2.1. `memory-mgmt` Architecture Review

- **Finding**: The `docs/projects/structure/memory-mgmt.md` document outlines a robust, multi-layered, and proactive memory management system. The design is sound and addresses many common pitfalls.
- **Conclusion**: The documented architecture is excellent. The investigation proceeded to verify its implementation.

### 2.2. `ImageMemoryManager` Analysis

- **File**: `lib/image-memory-manager.ts`
- **Finding**: The implementation aligns perfectly with the documentation. It uses a size-aware LRU cache (`maxSize`), enforces buffer limits, and coordinates with other systems.
- **Conclusion**: The `ImageMemoryManager` is **not** a source of unmanaged memory usage. It is a model component for memory-safe caching.

### 2.3. `ServerCache` Analysis (Primary Area of Concern)

- **File**: `lib/server-cache.ts`
- **Finding**: The `ServerCache` is built on `lru-cache` but is configured only with a `max` item count (100,000) and not a `maxSize` byte-based budget.
- **Vulnerability**: This allows the cache to grow to an unpredictable size. 100,000 small items might be fine, but 100,000 medium-sized JSON objects could easily exceed server memory limits. The 30-day default TTL exacerbates this issue by retaining objects for an extended period.
- **Conclusion**: The lack of a size-based budget in `ServerCache` is the single largest remaining architectural risk for memory stability.

### 2.4. Analysis of Data Stored in `ServerCache`

The investigation focused on the modules in `lib/server-cache/` to determine what data contributes to memory usage.

#### 2.4.1. Bookmarks (`bookmarks.ts`)

- **Finding**: This module was correctly refactored. It explicitly **does not** store bookmark data in the memory cache, opting instead to store a small metadata object. The actual data resides in S3.
- **Conclusion**: **Not a concern.**

#### 2.4.2. GitHub Activity (`github.ts`)

- **Finding**: This module caches the entire `GitHubActivityApiResponse` object in a single cache entry. This object contains arrays of contribution data spanning potentially many years.
- **Conclusion**: **Potential concern.** While only a single cache entry, the object's size can be substantial and is held in memory for up to 24 hours.

#### 2.4.3. OpenGraph Data (`opengraph.ts`)

- **Finding**: This module caches an `OgResult` object for every unique URL requested. These objects contain various metadata strings that can be large. The cache duration is 7 days.
- **Conclusion**: **High concern.** The number of cached items can grow indefinitely with user activity (e.g., as more bookmarks are added). This combination of unbounded item growth, potentially large object size, and a long TTL makes it a primary suspect for memory exhaustion over time.

## 3. Key Findings and Root Causes

1. **Root Cause**: The `ServerCache` is not configured with a `maxSize` property, making its memory footprint unpredictable and unbounded.
2. **Primary Symptom**: The `opengraph` cache is the most likely driver of memory issues, as it creates a new, long-lived cache entry for every unique URL.
3. **Secondary Symptom**: The `github-activity` cache contributes a single, but potentially very large, object to the memory footprint.
4. **Architectural Gap**: The robust, size-aware caching strategy implemented for images in `ImageMemoryManager` has not been applied to the general-purpose `ServerCache`.

## 4. Recommendations

To permanently resolve these remaining memory issues, the following actions are recommended:

1. **Re-architect `ServerCache` to be Size-Aware**:
    - Modify the `ServerCache` constructor in `lib/server-cache.ts` to accept a `maxSize` option, similar to `ImageMemoryManager`.
    - Implement a `sizeCalculation` function for the `LRUCache` that estimates the memory footprint of stored JSON objects. A simple `JSON.stringify(value).length` is a reasonable and low-overhead starting point.
    - Establish a sensible memory budget for the `ServerCache` via environment variables (e.g., `SERVER_CACHE_BUDGET_BYTES`), separate from the image cache budget.

2. **Reduce Cache TTLs**:
    - Review the `SERVER_CACHE_DURATION` (30 days) and `OPENGRAPH_CACHE_DURATION` (7 days). These values are excessively long for an in-memory cache.
    - Consider reducing them to shorter, more reasonable durations (e.g., 24-72 hours) to ensure stale data is evicted more frequently, reducing the baseline memory footprint.

3. **Implement Stale-While-Revalidate for Large Objects**:
    - For large data objects like the GitHub activity payload, consider a strategy where the data is served from a stale cache while a background refresh is triggered. This prevents holding onto large, old data for the full TTL.

By implementing these changes, the `ServerCache` will be brought in line with the best practices already established in the `ImageMemoryManager`, creating a more resilient and memory-safe application.
