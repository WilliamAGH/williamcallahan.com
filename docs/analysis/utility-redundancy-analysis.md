# Utility Redundancy Analysis

## Overview
This document identifies redundant functionality across utility files that should be consolidated.

## Key Redundancies

### 1. Hash Generation Functions

**Duplicate Implementations:**
- `lib/utils/hash-utils.ts::generateHash()` - Main hash utility
- `lib/utils/s3-key-generator.ts::generateHash()` - Duplicate implementation
- `lib/utils/opengraph-utils.ts` - Uses `crypto.createHash` directly

**Recommendation:** 
- Keep only `hash-utils.ts` implementation
- Update `s3-key-generator.ts` to import from `hash-utils.ts`
- Update `opengraph-utils.ts` to use `hash-utils.ts`

### 2. Content Type Utilities

**Duplicate Files:**
- `lib/utils/content-type.ts` - Comprehensive content type detection (3461 bytes)
- `lib/utils/content-type-utils.ts` - Basic content type mapping (1731 bytes)

**Overlapping Functions:**
- Both have `getExtensionFromContentType()`
- Similar content type to extension mappings

**Recommendation:**
- Merge into single `content-type.ts` file
- Remove `content-type-utils.ts`

### 3. S3 Organization Issues

**Current Structure:**
- `lib/s3-utils.ts` - Main S3 utilities
- `lib/s3-utils/index.ts` - Just re-exports from `../s3-utils.ts`
- `lib/utils/s3-key-generator.ts` - S3 key generation
- `lib/utils/cdn-utils.ts` - CDN URL building

**Issues:**
- Unnecessary folder structure (`lib/s3-utils/`)
- S3-related utilities spread across multiple locations
- Duplicate hash generation in s3-key-generator

**Recommendation:**
- Remove `lib/s3-utils/` folder
- Keep `lib/s3-utils.ts` as main S3 utility file
- Move S3 key generation logic to be closer to S3 utilities

### 4. JSON Handling

**Current State:**
- `lib/utils/json-utils.ts` - Newly created comprehensive JSON utilities
- Various files using raw `JSON.parse()` and `JSON.stringify()`
- `lib/utils/hash-utils.ts::getObjectHash()` - Has JSON stringification logic

**Recommendation:**
- Update all files to use `json-utils.ts` functions
- Remove duplicate JSON operations

### 5. File Extension Handling

**Duplicate Logic:**
- `lib/utils/s3-key-generator.ts::getFileExtension()` - URL/content-type to extension
- `lib/utils/content-type.ts::getExtensionFromContentType()` - Content-type to extension
- `lib/utils/http-client.ts::getImageExtensionFromContentType()` - Image content-type to extension

**Recommendation:**
- Consolidate into `content-type.ts`
- Remove duplicates from other files

## Implementation Priority

1. **High Priority:**
   - Fix hash generation duplicates (affects consistency)
   - Merge content-type utilities (clear duplication)
   - Clean up S3 folder structure

2. **Medium Priority:**
   - Consolidate file extension logic
   - Update JSON operations to use json-utils

3. **Low Priority:**
   - Review component utils for any shared logic that belongs in lib/utils

## Migration Plan

1. Update imports in all affected files
2. Run tests to ensure no breakage
3. Remove deprecated files
4. Update documentation

## Benefits

- Reduced code duplication
- Single source of truth for each utility
- Easier maintenance
- Consistent behavior across the application
- Smaller bundle size