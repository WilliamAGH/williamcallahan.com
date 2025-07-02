# S3 CDN Image Idempotency Architecture

## Core Purpose
Ensures education and experience domains ALWAYS fetch institution/company logos from S3 CDN idempotently - same domain input always produces same CDN URL output, preventing duplicate fetches and ensuring consistent branding across all page loads.

## Architecture Overview
Data Flow: Domain → UnifiedImageService → Memory Cache → S3 Check → External APIs → S3 Upload → CDN URL
Components:
- **UnifiedImageService** (`lib/services/unified-image-service.ts:41-943`): Singleton service managing all logo operations
- **Logo Facade** (`lib/data-access/logos.ts:42-93`): Backward-compatible interface to UnifiedImageService
- **CDN Utils** (`lib/utils/cdn-utils.ts:28-52`): Consistent CDN URL generation
- **Domain Utils** (`lib/utils/domain-utils.ts`): Normalizes URLs to consistent domains

## Key Features
- **Idempotent S3 Keys**: `lib/utils/s3-key-generator.ts` generates deterministic keys from domain+source
- **In-Flight Deduplication**: `unified-image-service.ts:170-177` prevents concurrent fetches for same domain
- **3-Tier Cache**: Memory (15min) → S3 (permanent) → External APIs (fallback)
- **CDN-First Delivery**: All logos served via `NEXT_PUBLIC_S3_CDN_URL` for performance

## Data Structures
```typescript
// types/logo.ts
export interface LogoResult {
  s3Key?: string;           // S3 storage key
  url: string | null;       // Legacy URL field
  cdnUrl?: string;          // CDN URL (preferred)
  source: LogoSource | null; // "google" | "duckduckgo" | null
  retrieval: "s3-store" | "external" | "api";
  contentType: string;
  timestamp: number;
}

// types/cache.ts
export interface LogoFetchResult {
  domain: string;
  s3Key?: string;
  cdnUrl?: string;
  source: LogoSource | null;
  contentType: string;
  timestamp: number;
  isValid: boolean;
  error?: string;
}
```

## Design Decisions

1. **Deterministic S3 Keys**: `unified-image-service.ts:575-582` uses domain+source+hash for consistent keys
2. **Pre-flight S3 Check**: `unified-image-service.ts:201-238` checks existing S3 keys before external fetch
3. **Domain Normalization**: All URLs normalized to base domain for consistent caching
4. **Session Tracking**: `unified-image-service.ts:48-52` prevents repeated failures in same session

## External Integrations

- **Google Favicons API**: Primary source at `lib/constants.ts` - 128px and 64px sizes
- **DuckDuckGo Icons API**: Fallback source - HD quality
- **AWS S3**: Logo storage bucket configured via `S3_BUCKET` env var
- **CloudFront CDN**: Serves logos from `NEXT_PUBLIC_S3_CDN_URL`

## Performance & Security

- Response times: S3 hit ~50ms, Memory cache ~5ms, External fetch 2-5s
- Memory safety: Buffers cleared immediately after processing at `unified-image-service.ts:148-149`
- Request coalescing: Duplicate requests share same Promise at `unified-image-service.ts:319-329`
- Security: No API keys in client, all access via public CDN URLs

## Implementation in Education Domain

```typescript
// lib/education-data-processor.ts:26-53
export async function processEducationItem(item: Education) {
  if (item.logo) {
    // Static logo path takes precedence
    return { url: item.logo, source: null };
  }
  
  // Domain normalization ensures consistency
  const domain = normalizeDomain(item.website || item.institution);
  const logoResult = await getLogo(domain);
  
  if (logoResult?.cdnUrl) {
    // Always prefer CDN URL
    return { url: logoResult.cdnUrl, source: logoResult.source };
  }
  
  // Fallback to placeholder
  return { url: "/images/company-placeholder.svg", source: "placeholder" };
}
```

## Implementation in Experience Domain

```typescript
// app/experience/page.tsx:71-95
// Check manifest first (pre-computed cache)
const manifestEntry = await getLogoFromManifestAsync(domain);
if (manifestEntry?.cdnUrl) {
  return { url: manifestEntry.cdnUrl, source: manifestEntry.originalSource };
}

// Fall back to UnifiedImageService
const logoResult = await getLogo(domain);
const url = logoResult?.cdnUrl ?? logoResult?.url ?? getCompanyPlaceholder();
return { url, source: logoResult?.source ?? null };
```

## 🐛 Critical Issues for Idempotency

### Environment Variable Issues (CRITICAL)

1. **Missing NEXT_PUBLIC_S3_CDN_URL** - `lib/services/unified-image-service.ts:92-100`: Warning logged but app continues with degraded performance
2. **Client-Side Fallback** - `lib/utils/cdn-utils.ts:43-46`: Returns relative path instead of CDN URL when env var missing
3. **No Validation** - `types/schemas/env.ts`: NEXT_PUBLIC_S3_CDN_URL not in environment schema

### Cache Consistency Issues

1. **Memory Cache Not Shared** - Each Next.js worker has separate ServerCacheInstance
2. **No Cache Invalidation** - Updated logos require manual S3 deletion
3. **Session Tracking Reset** - `unified-image-service.ts:833-834` clears tracking every 30min

### Idempotency Risks

1. **Non-Deterministic Hash** - `unified-image-service.ts:208-211`: Uses both SHA-256 and MD5 for legacy support
2. **Multiple Sources** - Same domain may have different S3 keys for google vs duckduckgo sources
3. **Case Sensitivity** - Domain normalization may not handle all edge cases

### Performance Issues

1. **Sequential Processing** - Education/Experience pages process logos one by one in Promise.all
2. **No Batch API** - UnifiedImageService has no batch fetch method
3. **Manifest Loading** - Image manifest loaded from disk on every request

## Operations & Testing

- Health: Monitor UnifiedImageService memory via `lib/health/memory-health-monitor.ts`
- Logs: Search for `[UnifiedImageService]` and `[Logos]` prefixes
- S3 Validation: `aws s3 ls s3://$S3_BUCKET/assets/images/logos/` to verify uploads
- Cache Clear: `ServerCacheInstance.clearAllLogoFetches()` for testing

## Recommendations

1. **Add NEXT_PUBLIC_S3_CDN_URL to env schema** with validation
2. **Implement batch logo fetching** for education/experience pages
3. **Cache image manifest** in memory with TTL
4. **Add cache warming** on app startup for common domains
5. **Implement CDN purge** workflow for logo updates

## Related Documentation

- `education.md` - Education domain implementation details
- `experience.md` - Experience domain implementation details
- `s3-object-storage.md` - S3 configuration and patterns
- `unified-image-service.md` - Deep dive into image service
- `caching.md` - Caching strategies and TTLs