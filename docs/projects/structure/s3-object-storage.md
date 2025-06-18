# S3 Object Storage Architecture

**Functionality:** `s3-object-storage`

## Core Objective

To provide a robust, centralized system for interacting with S3-compatible object storage services. The architecture implements a layered approach with clear separation of concerns: low-level utilities for direct S3 operations, a compatibility layer for Bun S3 API portability, and specialized modules for domain-specific operations (logos, images).

## Architecture Diagram

See `s3-object-storage.mmd` for a visual diagram of the data flow and decision logic.

## Data & Logic Flow

1. **Application Interaction**: Server components, API routes, and other modules interact with S3 through the `s3Client` exported from `lib/s3.ts`.
2. **Compatibility Layer (`lib/s3.ts`)**: This module serves as a high-level abstraction. It creates an instance of the AWS SDK `S3Client` but wraps it with methods (`.file()`, `.list()`) that are compatible with the Bun S3 API. This ensures that code written for a Bun environment can run in a standard Node.js/Webpack environment without modification.
3. **Core Utilities (`lib/s3-utils.ts`)**: The compatibility layer delegates all its operations to the functions within `lib/s3-utils.ts`. This module contains the direct implementation of S3 operations, such as `readFromS3`, `writeToS3`, `listS3Objects`, and `deleteFromS3`, using the official AWS SDK v3 commands.
4. **Error Handling & Retries**: The `s3-utils.ts` module includes retry logic for read operations and robust error handling to manage transient network issues or missing objects gracefully.
5. **CDN Integration**: For read operations, `s3-utils.ts` is configured to first attempt fetching public assets from a CDN to improve performance, falling back to a direct S3 read if the CDN request fails.

## Read/Write Strategy

### Read Strategy

1. **JSON Data**: For files ending in `.json`, the system **always bypasses the CDN** and reads directly from the S3 bucket to prevent serving stale metadata. This is a key interaction for the `json-handling` functionality.
2. **Binary Data (Images, etc.)**: For all other file types, the system first attempts to fetch the asset from the configured CDN (`S3_PUBLIC_CDN_URL`).
3. **Fallback to S3**: If the CDN fetch fails, it automatically falls back to a direct read from the S3 bucket.
4. **404 Handling**: If an object is not found (`NoSuchKey` error), the functions gracefully return `null` instead of throwing an error.

### Write Strategy

- All files are written directly to the S3 bucket.
- **Public Access**: Written objects are given a `public-read` ACL by default, making them accessible via the public CDN or a direct S3 URL. This is critical for the `image-handling` functionality.
- **Content-Type**: The `ContentType` is automatically inferred from the file extension, ensuring correct browser handling.

## Storage Organization

The S3 bucket is organized with prefixes to separate different types of data, such as `images/`, `opengraph/`, `bookmarks/`, and `github/`. This organized structure allows different functionalities to manage their data in a clean, separated manner.

## Key Files & Responsibilities

### Core Infrastructure

- **`lib/s3-utils.ts`**: Low-level S3 operations
  - Direct S3 CRUD operations using AWS SDK v3
  - CDN integration with fallback logic
  - Error handling and retry mechanisms
  - Type conversions (string/buffer)

- **`lib/s3.ts`**: Bun compatibility layer
  - High-level abstraction mimicking Bun's S3 API
  - Enables environment portability
  - Wraps AWS SDK with ergonomic interface

- **`lib/s3-utils/index.ts`**: Barrel file for cleaner imports

### Specialized Modules

- **`lib/data-access/logos/s3-operations.ts`**: Logo-specific operations
  - S3 key generation for logos
  - Domain-based logo search
  - Source normalization (e.g., duckduckgo → ddg)

- **`lib/data-access/logos/s3-store.ts`**: In-memory key cache
  - Reduces S3 list operations
  - Lazy initialization pattern
  - Cache lifecycle management

- **`lib/utils/image-s3-utils.ts`**: Generic image utilities
  - Image download and persistence
  - SVG → PNG conversion integration
  - Idempotent storage using unique keys

### Type Definitions

- **`types/s3.ts`**: TypeScript interfaces for S3 operations

## Configuration

The entire S3 system is configured via environment variables, which are checked in both `lib/s3.ts` and `lib/s3-utils.ts` to ensure the client and utilities are properly initialized. Key variables include `S3_BUCKET`, `S3_ENDPOINT_URL`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`.

## Environment Variables

```bash
# Essential for connecting to S3
S3_BUCKET=your-storage-bucket
S3_SERVER_URL=https://s3.amazonaws.com
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key

# Optional but recommended
S3_REGION=us-east-1
S3_PUBLIC_CDN_URL=https://cdn.your-domain.com

# For development/testing
DRY_RUN=false
```

## Critical Issues & Security Vulnerabilities

### ✅ FIXED: Default Public ACLs (2025-06)

- **Previous Issue**: `writeToS3` set all objects as publicly readable by default
- **Solution**: Made ACL an explicit parameter with "private" as default
- **Impact**: No more accidental public exposure of sensitive data
- **Usage**: Developers must now explicitly set `acl: "public-read"` when needed

### Performance & Reliability Issues

#### High Priority

- **Full Directory Scans**: `findImageInS3` lists entire directories as fallback
  - **Impact**: High S3 API costs, slow response times with scale
  - **Fix**: Redesign key structure for efficient prefix searches

- **Race Condition in Cache**: Multiple concurrent requests trigger duplicate S3 listings
  - **Impact**: Unnecessary API calls, unreliable caching
  - **Fix**: Use promise-based initialization pattern

- **✅ FIXED: Retry Logic (2025-06)**: Previously `MAX_S3_READ_RETRIES = 1` with too short delay
  - **Solution**: Increased to 3 retries with 100ms delay between attempts
  - **Impact**: Better resilience against transient network failures

#### Medium Priority

- **Redundant S3 Clients**: Both `s3.ts` and `s3-utils.ts` create separate clients
  - **Impact**: Resource waste, potential configuration drift
  - **Fix**: Reuse the existing configured client

- **Brittle Logo Selection**: Arbitrary "best" logo selection with fragile string matching
  - **Fix**: Implement explicit preference ordering

## Known Limitations

- **CDN JSON Bypass**: Hardcoded based on `.json` extension
- **Single S3Client Instance**: Potential bottleneck under extreme load
- **Limited Error Handling**: Only handles `NoSuchKey` and network errors
- **Content-Type Redundancy**: Re-derives type despite S3 metadata

## Architecture Flow

```
Application Code
    ↓
lib/s3.ts (Compatibility Layer)
    ↓
lib/s3-utils.ts (Core Operations)
    ↙          ↘
logos/s3-operations.ts    utils/image-s3-utils.ts
    ↓
logos/s3-store.ts (Caching)
```

## Performance

- **CDN Hit**: ~50-100ms
- **S3 Direct Read**: ~100-200ms
- **S3 Write**: ~200-500ms
- **Read Retry Delay**: +10ms (currently broken)
- **Directory Scan**: O(n) with bucket size - needs optimization

## Debugging

```bash
# Test direct S3 endpoint connectivity
curl -I "$S3_SERVER_URL/$S3_BUCKET/health-check.txt"

# Test CDN delivery
curl -I "$S3_PUBLIC_CDN_URL/images/logos/test.webp"

# List bucket contents using AWS CLI
aws s3 ls s3://$S3_BUCKET/ --endpoint-url=$S3_SERVER_URL
```
