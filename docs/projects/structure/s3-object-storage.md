# S3 Object Storage Architecture

**Functionality:** `s3-object-storage`

## Core Objective

Centralized S3-compatible object storage with layered abstraction: low-level utilities, Bun compatibility layer, and domain-specific operations. Optimized for CDN delivery with memory-safe integration.

## Architecture Diagram

See `s3-object-storage.mmd` for visual data flow.

## Read/Write Strategy

### Read Operations
1. **JSON**: Always bypasses CDN (prevents stale metadata)
2. **Images**: CDN first (~50ms) → S3 fallback (~100-200ms)
3. **404 Handling**: Returns `null` gracefully

### Write Operations
- Direct S3 writes with configurable ACL
- Content-Type auto-inference
- Immediate CDN availability for public assets

## Key Files

### Core Infrastructure
- **`lib/s3-utils.ts`**: Low-level S3 operations
  - AWS SDK v3 commands
  - CDN fallback logic
  - 3 retries with 100ms delay
  - Type conversions

- **`lib/s3.ts`**: Bun compatibility layer
  - Mimics Bun S3 API
  - Environment portability

### Specialized Modules
- **`lib/data-access/logos/s3-operations.ts`**: Logo operations
  - Domain-based key generation
  - Source normalization

- **`lib/data-access/logos/s3-store.ts`**: In-memory key cache
  - Reduces S3 list operations
  - Lazy initialization

## Configuration

```bash
# Required
S3_BUCKET=your-bucket
S3_ACCESS_KEY_ID=your-key
S3_SECRET_ACCESS_KEY=your-secret

# Recommended  
S3_REGION=us-east-1
S3_PUBLIC_CDN_URL=https://cdn.domain.com
S3_SERVER_URL=https://s3.amazonaws.com
```

## Memory Integration

- **Immediate Persistence**: Images uploaded to S3 immediately
- **CDN-First Delivery**: Avoids loading buffers into memory
- **Metadata Only**: Only S3 keys/CDN URLs cached
- **Stream Support**: Large images (>5MB) streamed directly

## Storage Organization

```
bucket/
├── images/          # Logos, general images
├── opengraph/       # OG images  
├── bookmarks/       # Bookmark data
└── github/          # Activity data
```

## Critical Issues

### ✅ FIXED (2025-06)
- Default public ACLs → Now explicit parameter
- Retry logic → 3 attempts with backoff

### High Priority
- **Full Directory Scans**: `findImageInS3` lists entire directories
  - Fix: Implement prefix-based key structure
  
- **Race Condition**: Concurrent requests trigger duplicate listings
  - Fix: Promise-based initialization

### Medium Priority  
- **Duplicate Clients**: Both `s3.ts` and `s3-utils.ts` create clients
- **Brittle Logo Selection**: String matching for "best" logo

## Performance

- CDN hit: ~50ms
- S3 direct: ~100-200ms  
- S3 write: ~200-500ms
- Directory scan: O(n) - needs optimization

## Architecture Flow

```
Application → s3.ts (Bun API) → s3-utils.ts (AWS SDK)
                                      ↓
                              Domain Operations
                              (logos, images, etc)
```