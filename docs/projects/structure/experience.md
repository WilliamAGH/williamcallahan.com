# Experience Architecture

## Core Purpose

The Experience domain displays professional work history with idempotent S3 CDN logo fetching at `app/experience/page.tsx:61-108` ensuring consistent company branding. Uses logoOnlyDomain property at `types/experience.ts:43` for logo resolution override when company domain differs from website. Entries flagged with `cvFeatured` are additionally consumed by the `/cv` route to present a condensed résumé view without duplicating data.

## Architecture Overview

Data Flow: Static Data -> Request-Time Processing -> Manifest Check -> S3 CDN Fetch -> Client Render
Components:

- **Data Layer** (`data/experience.ts:1-45`): Static array of work experiences with optional logoOnlyDomain
- **Page Processing** (`app/experience/page.tsx:61-108`): Complex logo resolution with 3-tier fallback
- **Logo Manifest** (`lib/image-handling/image-manifest-loader.ts`): Pre-computed logo cache check
- **Client UI** (`components/features/experience/experience.client.tsx:39-111`): Window-managed display

## Key Features

- **logoOnlyDomain Override**: `types/experience.ts:37-43` allows separate domain for logo fetching vs website link, which should override the normal domain url (for logo purposes)
- **3-Tier Logo Resolution**: Manifest -> `getLogoCdnData()` (direct UnifiedImageService call) -> Static fallback at `page.tsx`
- **Idempotent Fetching**: Always returns same CDN URL for given domain via UnifiedImageService
- **CV Flagging**: `data/experience.ts` sets `cvFeatured` for items surfaced on the `/cv` curriculum vitae route without duplicating records.
- **CV Narrative Balance**: `/cv` now renders highlighted technical projects directly after qualifications (`app/cv/page.tsx:134-190`) so engineering initiatives lead into the finance-oriented experience list.

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
  logo?: string; // Static logo path
  website?: string;
  accelerator?: Accelerator;
  location?: string;
  logoOnlyDomain?: string; // Override domain for logo fetching
  cvFeatured?: boolean; // Highlight in app/cv
}

// types/index.ts (LogoData)
export interface LogoData {
  url: string; // Always CDN URL when available
  source: string | null; // "manifest" | "s3-store" | "static" | null
}
```

## Design Decisions

1. **logoOnlyDomain Pattern**: `page.tsx:71-75` prioritizes logoOnlyDomain over website/company for accurate logos
2. **Manifest-First**: `page.tsx:77-84` checks pre-computed manifest before hitting UnifiedImageService
3. **Dynamic Rendering**: Uses `force-dynamic` to resolve logos at request time, preventing build-time API access issues
4. **Server-Side Only**: All logo resolution server-side, no client-side fetching
5. **Explicit Fallback**: `page.tsx:89` uses getCompanyPlaceholder() for consistent placeholder

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

## Related Documentation

- `experience.mmd` - visual flow diagram
- `s3-object-storage.md` - S3 CDN details
- `image-handling.md` - logo processing patterns
