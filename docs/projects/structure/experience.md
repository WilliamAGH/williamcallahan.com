# Experience Architecture

## Core Purpose
The Experience domain displays professional work history with idempotent S3 CDN logo fetching at `app/experience/page.tsx:61-108` ensuring consistent company branding. Uses logoOnlyDomain property at `types/experience.ts:43` for logo resolution override when company domain differs from website.

## Architecture Overview
Data Flow: Static Data → Page Processing → Manifest Check → S3 CDN Fetch → Client Render
Components:
- **Data Layer** (`data/experience.ts:1-45`): Static array of work experiences with optional logoOnlyDomain
- **Page Processing** (`app/experience/page.tsx:61-108`): Complex logo resolution with 3-tier fallback
- **Logo Manifest** (`lib/image-handling/image-manifest-loader.ts`): Pre-computed logo cache check
- **Client UI** (`components/features/experience/experience.client.tsx:39-111`): Window-managed display

## Key Features
- **logoOnlyDomain Override**: `types/experience.ts:37-43` allows separate domain for logo fetching vs website link, which should override the normal domain url (for logo purposes)
- **3-Tier Logo Resolution**: Manifest → S3 CDN → Static fallback at `page.tsx:77-95`
- **Idempotent Fetching**: Always returns same CDN URL for given domain via UnifiedImageService

## Data Structures
```typescript
// types/experience.ts:15-44
export interface Experience {
  id: string;
  company: string;
  period: string;
  startDate: string;
  endDate?: string;
  role: string;
  logo?: string;  // Static logo path
  website?: string;
  accelerator?: Accelerator;
  location?: string;
  logoOnlyDomain?: string;  // Override domain for logo fetching
}

// types/index.ts (LogoData)
export interface LogoData {
  url: string;  // Always CDN URL when available
  source: string | null;  // "manifest" | "s3-store" | "static" | null
}
```

## Design Decisions

1. **logoOnlyDomain Pattern**: `page.tsx:71-75` prioritizes logoOnlyDomain over website/company for accurate logos
2. **Manifest-First**: `page.tsx:77-84` checks pre-computed manifest before hitting UnifiedImageService
3. **Server-Side Only**: All logo resolution at build time, no client-side fetching
4. **Explicit Fallback**: `page.tsx:89` uses getCompanyPlaceholder() for consistent placeholder

## External Integrations

- **UnifiedImageService**: Primary logo fetching via `lib/data-access/logos.ts:42-93`
- **Image Manifest**: Static manifest at `public/assets/image-manifest.json`
- **S3 CDN**: Serves all logos from `NEXT_PUBLIC_S3_CDN_URL`

## Performance & Security

- Response times: ~50ms for manifest hits, ~200ms for cached S3, 2-5s for external
- Memory: Logo buffers cleared immediately after processing
- Security: No API keys exposed, all logos via public CDN

## Operations & Testing

- Health: No specific endpoints
- Tests: None found for experience domain
- Ops: `bun run validate` for type checking

## 🐛 Bugs & Improvements Inventory

### Type/Validation Issues (PRIORITY)

1. **Missing Validation** - `data/experience.ts:1-45`: No Zod schema for experience data
2. **Type Inconsistency** - `types/features/experience.ts`: ExperienceCardProps uses different property names than Experience type
3. **No LogoData Validation** - `page.tsx:91-94`: LogoData object created without schema validation
4. **Any Type Risk** - `page.tsx:99`: Generic error catch without typed error handling

### Environment Issues (CRITICAL)

1. **Missing CDN URL Check** - `lib/utils/cdn-utils.ts:114-119`: Client gets undefined s3BucketName/s3ServerUrl
2. **No Env Schema** - `types/schemas/env.ts:8-21`: Missing NEXT_PUBLIC_S3_CDN_URL in environment schema

### Hydration Issues

1. **Dynamic Logo Loading** - `experience.client.tsx:104`: ExperienceCardClient receives pre-computed logoData, no hydration risk
2. **Window State** - `experience.client.tsx:40-47`: useRegisteredWindowState may cause hydration mismatch if SSR

### Performance Issues

1. **Sequential Logo Processing** - `page.tsx:62`: Promise.all used but each logo processed individually in map
2. **No Streaming** - `page.tsx:110-116`: Could use Suspense for progressive rendering
3. **Manifest Not Cached** - `lib/image-handling/image-manifest-loader.ts`: Manifest loaded on every request

### Bugs

1. **Silent Failures** - `page.tsx:97-106`: Errors logged but user sees placeholder without notification
2. **logoOnlyDomain Not Documented** - UI doesn't indicate when logoOnlyDomain differs from website

### Improvements

1. **Batch Logo API** - `page.tsx:61-108`: Single batch request to UnifiedImageService, effort: M
2. **Manifest Caching** - Cache parsed manifest in memory, effort: S
3. **Loading Skeleton** - Show skeleton while logos fetch, effort: S
4. **Type Alignment** - Align ExperienceCardProps with Experience type, effort: M

### British English

None found in experience domain files.

## Related Documentation

- `experience.mmd` - visual flow diagram
- `s3-object-storage.md` - S3 CDN details
- `image-handling.md` - logo processing patterns