# Education Architecture

## Core Purpose

The Education domain manages display of university degrees, courses, and certifications with idempotent S3 CDN logo fetching at `lib/education-data-processor.ts:25-87` for consistent institution branding across all renders. Items flagged with `cvFeatured` populate the condensed education and credential sections on `/cv` without duplicating data structures.

## Architecture Overview

Data Flow: Static Data -> Server Processing -> Logo Fetch -> Client Render
Components:

- **Data Layer** (`data/education.ts:1-85`): Static arrays of education, courses, certifications
- **Server Processing** (`components/features/education/education.server.tsx:20-40`): Async concurrent logo processing
- **Logo Processor** (`lib/education-data-processor.ts:26-87`): S3 CDN fetch with fallback logic
- **Client UI** (`components/features/education/education.client.tsx:53-351`): Interactive table with search/sort

## Key Features

- **Idempotent Logo Fetching**: Manifest-first with a fallback to `getLogoCdnData()` (direct UnifiedImageService call) inside `lib/education-data-processor.ts`, so no `/api/logo` proxy hops are required.
- **Concurrent Processing**: Promise.all at `education.server.tsx:22-30` for parallel logo fetches
- **Client-Side Interactivity**: Search/filter/sort at `education.client.tsx:74-127` without re-fetching logos
- **CV Flagging**: `data/education.ts` applies `cvFeatured` to surface a curated subset on the curriculum vitae page.

## Data Structures

```typescript
// types/education.ts:12-27
interface EducationBase {
  id: string;
  institution: string;
  year: number;
  website: string;
  location: string;
  logo?: string; // Static logo path fallback
  logoScale?: number;
  cvFeatured?: boolean; // Highlighted on the /cv page when true
}

// types/education.ts:62-65
export interface EducationLogoData {
  url: string; // Always CDN URL when available
  source: string | null; // "s3-store" | "external" | "placeholder"
}
```

## Design Decisions

1. **Dynamic Rendering**: Uses `force-dynamic` to resolve logos at request time, preventing build-time API access issues
2. **S3 CDN Priority**: `lib/education-data-processor.ts:41` always uses CDN URL from getLogo() result
3. **Domain Normalization**: `lib/education-data-processor.ts:37` normalizes domains for consistent S3 keys
4. **Server-Only Processing**: `lib/education-data-processor.ts:5` enforces server-side execution for S3 access
5. **Placeholder Fallback**: `lib/education-data-processor.ts:18` returns `/images/company-placeholder.svg` on errors

## External Integrations

- **UnifiedImageService v1**: Logo fetching via `lib/data-access/logos.ts` facade
- **S3 CDN**: All logos served from `NEXT_PUBLIC_S3_CDN_URL` environment variable
- **Domain Utils**: `lib/utils/domain-utils.ts` for URL -> domain extraction

## Performance & Security

- Response times: ~200ms for cached logos, 2-5s for external fetch
- TTL: 15min memory cache in ServerCacheInstance
- Security: No client-side S3 access, all logos via public CDN URLs

## Operations & Testing

- Health: No specific endpoints, relies on UnifiedImageService health
- Tests: None found for education domain specifically
- Ops: `bun run validate` for type checking

## Related Documentation

- `education.mmd` - visual flow diagram
- `s3-object-storage.md` - S3 CDN configuration details
- `image-handling.md` - image processing patterns
