# Memory Management Architecture

**Functionality**: `memory-mgmt`

## Core Objective

To provide robust, multi-layered memory management that prevents leaks, ensures application stability under load, and offers graceful degradation during periods of high memory pressure. This system is critical for handling large volumes of image processing and data caching without causing server-side failures.

## Key Files

- **`lib/image-memory-manager.ts`**: The cornerstone of image memory management. This is a size-aware LRU cache specifically for `Buffer` objects. It enforces a total memory budget, sets per-image size limits, and uses request coalescing to prevent redundant fetches. It emits events on memory pressure changes, which are consumed by the `MemoryHealthMonitor`.
- **`lib/health/memory-health-monitor.ts`**: The central nervous system for memory health. It monitors RSS usage against warning and critical thresholds, maintains a history of memory metrics, and coordinates system-wide responses to memory pressure, such as triggering emergency cleanups.
- **`lib/middleware/memory-pressure.ts`**: The application's first line of defense. This middleware runs on all incoming requests and, if memory usage is critical, immediately returns a `503 Service Unavailable` response to shed load. It exempts health check endpoints to ensure the system remains observable.
- **`lib/server/mem-guard.ts`**: A simple, periodic RSS watchdog. It acts as a last-resort safety net, flushing all caches if memory usage unexpectedly spikes beyond the critical threshold.
- **`lib/async-operations-monitor.ts`**: Tracks all significant asynchronous operations, providing timeouts and visibility into pending tasks. This helps the `MemoryHealthMonitor` to make more informed decisions by knowing if the system is busy with background work.
- **`lib/constants.ts`**: Defines the `MEMORY_THRESHOLDS` object, which centralizes all memory-related budget and threshold values, ensuring all components operate from a single source of truth.

## Logic Flow

### **Coordinated Memory Management (2025-06 Redesign)**

The system now operates on **coordinated proactive management** rather than independent reactive systems:

1. **Unified Monitoring System**:
    - **ImageMemoryManager** acts as the primary memory monitor (every 30s)
    - Uses consistent RSS-based thresholds aligned with total process budget
    - **S3Utils** and other systems query ImageMemoryManager for pressure state

2. **Proactive Coordination Cascade**:
    - **70% RSS**: ImageMemoryManager triggers `memory-coordination-trigger` event
      - Starts proactive LRU eviction in ImageMemoryManager (60% target)
      - ServerCache listens and clears 25% of oldest entries
      - All systems begin memory-aware request handling
    - **80% RSS**: Memory pressure mode activated
      - All new memory-intensive operations rejected/queued
      - S3 operations check pressure before reading
      - OpenGraph enrichment skips processing
3. **Emergency Failsafes** (should rarely trigger):
    - **90% RSS**: MemGuard critical monitoring validates coordination worked
    - **95% RSS**: Nuclear option - full cache flush (coordination failed)

4. **Early Request Rejection**:
    - Memory pressure checks **before** starting operations, not after
    - S3 reads validate size limits and memory state
    - Image processing queued or skipped under pressure
    - Bookmark enrichment degrades gracefully

5. **State Coordination**:
    - **Single source of truth**: ImageMemoryManager memory pressure state
    - **Consistent metrics**: All systems use same RSS thresholds
    - **Event-driven**: Coordination via event emitters, not polling

6. **Observability**:
    - The `/api/health` endpoint exposes coordinated system status
    - The `/api/health/metrics` endpoint shows cross-system memory coordination
    - MemGuard logs validate that proactive systems are working

## Critical Issues & Design Decisions

- **Centralized Thresholds**: All memory thresholds are defined in `lib/constants.ts` to prevent configuration drift between the middleware and the health monitor.
- **Buffer Safety**: The `ImageMemoryManager` always creates a `Buffer.from(copy)` to prevent memory leaks from `Buffer.slice()` holding references to larger parent buffers.
- **Singleton Pattern**: All core components (`ImageMemoryManager`, `MemoryHealthMonitor`, `ServerCacheInstance`) are implemented as singletons to ensure a single, consistent state across the application.
- **Non-Blocking Initialization**: The `mem-guard` and other monitoring services are initialized via non-blocking, side-effect imports in `instrumentation.ts` to ensure they do not delay server startup.
- **Graceful Degradation**: The system is designed not to fail catastrophically. The multi-stage health status allows it to handle memory pressure gracefully by first warning, then actively shedding load, and finally performing emergency cleanup.

## Architecture Diagram

See `memory-mgmt.mmd` for a visual diagram of the memory management flow and safeguards.

## Recent Optimizations (2025-06-20)

### Sharp Memory Configuration
- **Sharp cache fully disabled**: Uses `sharp.cache({ files: 0, items: 0, memory: 0 })` to prevent libvips internal cache retention
- **Concurrency limited**: Set to 1 to reduce memory spikes during concurrent processing
- **Result**: Prevents ~50MB of hidden memory retention per Sharp operation

### Size-Aware Cache Eviction
- **ServerCache**: Now uses LRU cache with `maxSize` budget (256MB) and byte-accurate size calculation
- **S3 Existence Cache**: Added 8MB size limit to prevent unbounded growth of 50k keys
- **Result**: Caches now respect memory budgets and evict based on actual byte usage

### Next.js 15 Optimizations
- **Webpack memory optimizations**: Enabled via `experimental.webpackMemoryOptimizations`
- **Source maps disabled**: Both client and server source maps disabled in production
- **Build worker enabled**: `experimental.webpackBuildWorker` for build-time memory isolation
- **Route preloading disabled**: Prevents 300-500MB initial RSS spike

### Monitoring Enhancements
- **New endpoint**: `/api/metrics/cache` provides detailed cache statistics for Grafana
- **Prometheus support**: Can return metrics in Prometheus format via `METRICS_FORMAT=prometheus`
- **Comprehensive metrics**: Tracks buffer cache, metadata cache, operations, and hit rates

### Search Standardization
- **Bookmarks search**: Now uses MiniSearch like all other content types
- **Unified caching**: All search indexes cached with proper TTLs
- **Result**: Eliminates API-based bookmark search and standardizes fuzzy search

## Recently Resolved Issues

### ✅ FIXED: Memory System Coordination (2025-06-20)

**Problem**: Memory guards were constantly firing (every 30s) at emergency thresholds because proactive systems weren't coordinating effectively. RSS usage reached 3.5GB while individual systems operated independently with conflicting metrics.

**Root Cause**:

- ImageMemoryManager used heap-based thresholds
- MemGuard used RSS-based thresholds  
- S3Utils used different pressure calculations
- ServerCache had no coordination with other memory systems
- Systems accumulated memory instead of failing early

**Solution**: Implemented coordinated proactive memory management:

- **Unified metrics**: All systems now use consistent RSS-based thresholds
- **Event-driven coordination**: ImageMemoryManager triggers ServerCache cleanup at 70% RSS
- **Early request rejection**: Memory checks before operations start, not after
- **Consistent pressure detection**: Single source of truth via ImageMemoryManager
- **MemGuard as validator**: Now monitors coordination effectiveness vs acting independently

**Result**: Emergency memory guards should rarely trigger as proactive systems coordinate to prevent pressure buildup.

### ✅ FIXED: Buffer.slice() Memory Retention (2025-06)

- **Previous Issue**: `Buffer.slice()` creates views that retain references to parent buffers
- **Solutions**:
  - Replaced all `buffer.slice(0, 1024)` with `buffer.toString("utf-8", 0, 1024)`
  - Files fixed: `lib/data-access/logos.ts:334`, `lib/data-access/logos/image-processing.ts:75`
- **Impact**: Parent buffers can now be garbage collected properly

### ✅ FIXED: ServerCache Buffer Storage (2025-06)

- **Previous Issue**: ServerCache stored raw buffers with `useClones: false`
- **Solutions**:
  - Changed `useClones` to `false` as buffers are no longer stored directly
  - Added size rejection for buffers > 50MB in `ImageMemoryManager`
  - Implemented max keys limit with batch eviction
- **Impact**: No more unbounded memory growth in cache

### ✅ FIXED: Missing Memory Limits (2025-06)

- **Previous Issue**: No limits on total memory usage for images
- **Solutions**:
  - Created `ImageMemoryManager` with LRU cache and size budget
  - Implemented memory pressure detection and automatic cleanup
  - Added health monitoring with graceful degradation
- **Impact**: Memory usage now capped and monitored

## Core Components

### 1. ImageMemoryManager (`lib/image-memory-manager.ts`)

Central controller for all image buffer storage with:

- **LRU Cache**: Size-aware eviction (default 512MB budget)
- **Request Coalescing**: Prevents duplicate fetches
- **Memory Pressure Detection**: Multi-level thresholds
- **Buffer Copying**: Ensures no slice() retention

### 2. UnifiedImageService (`lib/services/unified-image-service.ts`)

Consolidates all image operations:

- **Async Monitoring**: Integrates with `AsyncOperationsMonitor`
- **S3 Persistence**: Images stored to S3 immediately
- **CDN Delivery**: Serves from CDN when possible
- **Metadata Caching**: Only metadata in ServerCache, not buffers

### 3. MemoryHealthMonitor (`lib/health/memory-health-monitor.ts`)

Health monitoring and graceful degradation:

- **Multi-Level Status**: healthy → warning → critical
- **Load Balancer Integration**: Returns 503 when critical
- **Emergency Cleanup**: Automatic cache clearing
- **Metrics Tracking**: Memory trend analysis

## Memory Protection Layers

### Layer 1: Size Limits

- Individual buffers limited to `MAX_IMAGE_SIZE_BYTES` (50MB default)
- Total cache limited to `IMAGE_RAM_BUDGET_BYTES` (512MB default)
- ServerCache rejects buffers > 50MB

### Layer 2: Memory Pressure Detection

- RSS threshold: 1.5GB (configurable)
- Heap threshold: 85% of total heap
- Aggressive cleanup when thresholds exceeded

### Layer 3: Health Checks

- `/api/health` endpoint for monitoring
- Degraded status at 75% memory usage
- Critical status at 90% memory usage
- Automatic removal from load balancer at critical

### Layer 4: Emergency Cleanup

- Triggered automatically in critical state
- Clears all caches (image and server)
- Forces garbage collection if available
- Tracked via AsyncOperationsMonitor

### Layer 5: Process Monitoring

- External health checks via container orchestration
- Automatic restart on repeated failures
- Memory limits enforced at container level

## Integration with Other Systems

### Caching System

- ServerCache no longer stores buffers directly
- Only metadata (S3 keys, CDN URLs) cached
- ImageMemoryManager handles all buffer caching
- Prevents memory bloat from cache growth

### S3 Object Storage

- Images persisted to S3 immediately after processing
- S3 keys stored in cache, not buffers
- CDN URLs preferred for serving
- Fallback to signed S3 URLs if CDN unavailable

### Async Operations Monitor

- All image operations wrapped with `monitoredAsync`
- 30-second timeout for image fetches
- Operation tracking with metadata
- Failure tracking and reporting

### Bookmarks System

- OpenGraph images handled by UnifiedImageService
- No more buffer storage in bookmark cache
- Karakeep fallbacks use same memory-safe pipeline
- Background refresh respects memory pressure

## Key Files & Responsibilities

### Core Memory Management

- `lib/image-memory-manager.ts`: Central memory controller
- `lib/health/memory-health-monitor.ts`: Health monitoring
- `lib/services/unified-image-service.ts`: Unified image operations

### Type Definitions

- `types/image.ts`: ImageMemoryMetrics interface
- `types/health.ts`: HealthCheckResult, MemoryMetrics
- `types/cache.ts`: Updated cache types without buffers

### Tests

- `__tests__/memory-leak-prevention.test.ts`: Comprehensive test suite

## Configuration

### Environment Variables

```bash
# Memory Budgets
TOTAL_PROCESS_MEMORY_BUDGET_BYTES=2147483648  # 2GB total process memory budget
IMAGE_RAM_BUDGET_BYTES=536870912              # 512MB for images specifically (consider 256MB)
SERVER_CACHE_BUDGET_BYTES=268435456           # 256MB for general data caching
MAX_IMAGE_SIZE_BYTES=52428800                 # 50MB max per image

# Memory Pressure Thresholds (calculated from TOTAL_PROCESS_MEMORY_BUDGET_BYTES)
IMAGE_RSS_THRESHOLD=1610612736                # 1.5GB RSS limit for ImageMemoryManager
IMAGE_HEAP_THRESHOLD=268435456                # 256MB heap limit for ImageMemoryManager

# Health Check Thresholds (calculated from TOTAL_PROCESS_MEMORY_BUDGET_BYTES)
MEMORY_WARNING_THRESHOLD=1503238553           # 1.4GB (70% of 2GB total budget)
MEMORY_CRITICAL_THRESHOLD=1932735283          # 1.8GB (90% of 2GB total budget)
```

### Memory Budget Architecture

The system now uses **three separate memory budgets**:

1. **Total Process Memory Budget** (`TOTAL_PROCESS_MEMORY_BUDGET_BYTES`):
   - Used by `mem-guard.ts` to monitor overall RSS usage
   - Default: 2GB for containers
   - Prevents false positives on normal Node.js memory usage

2. **Image Cache Budget** (`IMAGE_RAM_BUDGET_BYTES`):
   - Used by `ImageMemoryManager` for LRU cache sizing
   - Default: 512MB for image buffers only
   - Consider lowering to 256MB to achieve 600-900MB RSS target
   - Prevents image processing from consuming too much memory

3. **Server Cache Budget** (`SERVER_CACHE_BUDGET_BYTES`):
   - Used by `ServerCache` for general data caching
   - Default: 256MB with size-aware eviction
   - Stores JSON, strings, and metadata (no raw buffers)

### Memory Thresholds Explained

| Threshold | RSS Usage | Action | Purpose |
|-----------|-----------|--------|---------|
| 70% (1.4GB) | Coordination | ServerCache evicts 25%, ImageManager evicts to 60% | Proactive memory management |
| 75% (1.5GB) | Warning | Health monitor reports degraded status | Load balancer awareness |
| 80% (1.6GB) | Image Pressure | Reject new image ops | Protect image processing |
| 90% (1.8GB) | Critical | Clear image cache, return 503 | Aggressive cleanup |
| 95% (1.9GB) | Emergency | Flush all caches | Last resort |

### Why This Fixes False Positives

**Previous Issue**: The system was using a 512MB image cache budget to monitor **total process RSS**, causing warnings at 409MB RSS - but this is normal for Next.js + data loading.

**New Approach**: Separate budgets mean:

- RSS at 430MB is now only 43% of 1GB budget (healthy)
- Image operations are protected when RSS hits 80% (819MB)
- Critical warnings only trigger at truly problematic levels (922MB+)

## Monitoring & Observability

### Events Emitted

- `image-disposed`: Buffer evicted from cache
- `memory-pressure-start`: Entering protective mode
- `memory-pressure-end`: Pressure resolved
- `buffer-rejected`: Buffer rejected due to size/pressure
- `emergency-cleanup-start/end`: Cleanup cycle events
- `status-changed`: Health status transitions

### Metrics Tracked

- `cacheSize`: Number of cached images
- `cacheBytes`: Total bytes in cache
- `rss/heapUsed/external`: Memory usage metrics
- `memoryPressure`: Boolean pressure state
- `asyncOperations`: Pending operation count

## Critical Implementation Details

### Buffer Handling

```typescript
// ❌ NEVER use Buffer.slice() - retains parent
const bad = buffer.slice(0, 1024);

// ✅ Use toString with offset/length
const good = buffer.toString("utf-8", 0, 1024);

// ✅ Or create a copy if buffer needed
const copy = Buffer.from(buffer.subarray(0, 1024));
```

### Cache Storage

```typescript
// ❌ Don't store buffers in ServerCache
ServerCacheInstance.set('key', largeBuffer);

// ✅ Store metadata only
ServerCacheInstance.set('key', {
  s3Key: 'images/abc123.png',
  cdnUrl: 'https://cdn.example.com/images/abc123.png',
  contentType: 'image/png'
});
```

### Memory-Aware Operations

```typescript
// Always check memory pressure before operations
if (!memoryManager.shouldAllowImageOperations()) {
  return { error: 'System under memory pressure' };
}

// Wrap operations with monitoring
await monitoredAsync(
  null,
  'process-image',
  async () => processImage(buffer),
  { timeoutMs: 30000 }
);
```

## Testing Strategy

### Unit Tests

- Buffer.slice() prevention verification
- Memory budget enforcement
- Request coalescing behavior
- Cache eviction logic

### Integration Tests

- Memory pressure simulation
- Health check responses
- Emergency cleanup triggers
- End-to-end image pipeline

### Load Tests

- Concurrent image processing
- Memory growth under load
- Graceful degradation behavior
- Recovery after pressure

## Debugging Memory Issues

```bash
# Run with GC exposed for testing
node --expose-gc --max-old-space-size=2048 server.js

# Take heap snapshot
kill -USR2 <pid>

# Monitor memory usage
NODE_ENV=development npm run dev
# Watch for [ImageMemory] and [MemoryHealth] logs

# Check health endpoint
curl http://localhost:3000/api/health
```

## Future Improvements

1. **Redis-backed image cache**: Move buffer storage to Redis
2. **Worker threads**: Process images in separate threads
3. **Streaming processing**: Avoid loading full buffers
4. **Progressive image loading**: Serve lower quality first
5. **Memory profiling integration**: Automatic heap snapshots
