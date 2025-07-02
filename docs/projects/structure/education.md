# Education Architecture

## Core Purpose
The Education domain manages display of university degrees, courses, and certifications with idempotent S3 CDN logo fetching at `lib/education-data-processor.ts:25-87` for consistent institution branding across all renders.

## Architecture Overview
Data Flow: Static Data → Server Processing → Logo Fetch → Client Render
Components:
- **Data Layer** (`data/education.ts:1-85`): Static arrays of education, courses, certifications
- **Server Processing** (`components/features/education/education.server.tsx:20-40`): Async concurrent logo processing
- **Logo Processor** (`lib/education-data-processor.ts:26-87`): S3 CDN fetch with fallback logic
- **Client UI** (`components/features/education/education.client.tsx:53-351`): Interactive table with search/sort

## Key Features
- **Idempotent Logo Fetching**: Always fetches from S3 CDN via UnifiedImageService at `lib/education-data-processor.ts:38-45`
- **Concurrent Processing**: Promise.all at `education.server.tsx:22-30` for parallel logo fetches
- **Client-Side Interactivity**: Search/filter/sort at `education.client.tsx:74-127` without re-fetching logos

## Data Structures
```typescript
// types/education.ts:12-27
interface EducationBase {
  id: string;
  institution: string;
  year: number;
  website: string;
  location: string;
  logo?: string;  // Static logo path fallback
  logoScale?: number;
}

// types/education.ts:62-65
export interface EducationLogoData {
  url: string;  // Always CDN URL when available
  source: string | null;  // "s3-store" | "external" | "placeholder"
}
```

## Design Decisions

1. **S3 CDN Priority**: `lib/education-data-processor.ts:41` always uses CDN URL from getLogo() result
2. **Domain Normalization**: `lib/education-data-processor.ts:37` normalizes domains for consistent S3 keys
3. **Server-Only Processing**: `lib/education-data-processor.ts:5` enforces server-side execution for S3 access
4. **Placeholder Fallback**: `lib/education-data-processor.ts:18` returns `/images/company-placeholder.svg` on errors

## External Integrations

- **UnifiedImageService v1**: Logo fetching via `lib/data-access/logos.ts` facade
- **S3 CDN**: All logos served from `NEXT_PUBLIC_S3_CDN_URL` environment variable
- **Domain Utils**: `lib/utils/domain-utils.ts` for URL → domain extraction

## Performance & Security

- Response times: ~200ms for cached logos, 2-5s for external fetch
- TTL: 15min memory cache in ServerCacheInstance
- Security: No client-side S3 access, all logos via public CDN URLs

## Operations & Testing

- Health: No specific endpoints, relies on UnifiedImageService health
- Tests: None found for education domain specifically
- Ops: `bun run validate` for type checking

## 🐛 Bugs & Improvements Inventory

### Type/Validation Issues (PRIORITY)

1. **Missing Validation** - `data/education.ts:1-85`: No Zod schema for education/certification data
2. **Type Duplication** - `types/education.ts:34-57`: Education/Class/Certification share 80% properties, should extend base
3. **No Runtime Validation** - `education.server.tsx:23-29`: processCertificationItem returns unvalidated

### Environment Issues (CRITICAL)

1. **Missing Env Validation** - `lib/services/unified-image-service.ts:42`: NEXT_PUBLIC_S3_CDN_URL used without schema validation
2. **Fallback Risk** - `lib/utils/cdn-utils.ts:44-46`: Client-side falls back to relative paths when CDN URL missing

### Hydration Issues

1. **Dynamic Sorting** - `education.client.tsx:97-117`: Client-side sort may differ from server order
2. **Image Loading** - `education.client.tsx:302-309`: Next/Image without placeholder causes layout shift

### Performance Issues

1. **Sequential Processing** - `lib/education-data-processor.ts:26-53`: Each logo fetch is async but called sequentially in map
2. **No Suspense Boundary** - `app/education/page.tsx:56-61`: Page doesn't use Suspense for async Education component

### Bugs

1. **Error Swallowing** - `lib/education-data-processor.ts:47-50`: Logs error but returns placeholder without user notification
2. **Missing logoScale** - `education.client.tsx:302-309`: logoScale property defined in type but never used in rendering

### Improvements

1. **Batch Logo Fetching** - `education.server.tsx:22-30`: Could batch all domains to UnifiedImageService, effort: M
2. **Add Loading States** - `education.client.tsx:134-137`: Show skeleton while isRegistered is false, effort: S
3. **Cache Manifest** - Create static manifest of known institution logos to avoid runtime fetches, effort: L

### British English

None found in education domain files.

## Related Documentation

- `education.mmd` - visual flow diagram
- `s3-object-storage.md` - S3 CDN configuration details
- `image-handling.md` - image processing patterns
