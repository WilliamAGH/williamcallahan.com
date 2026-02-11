# Project Architecture Entrypoint

This document serves as the master index for all architectural documentation in the repository. It provides a high-level overview of each defined "functionality," its core objective, and direct links to its detailed documentation and visual diagrams.

**Start here** to understand the structure and responsibilities of different parts of the application.

## CRITICAL: TypeScript, Next.js & React Guidance

This project enforces **100% strict TypeScript type safety** and adherence to modern Next.js and React best practices. All code must pass `bun run validate` before any commit. This is non-negotiable.

**Framework guardrails live in [`nextjs-framework.md`](../standards/nextjs-framework.md).** Read it before changing anything tied to Next.js 16, React 19, or Vitest 4.

For a comprehensive guide on how to diagnose and fix type errors, and for crucial framework guidance, see the master playbook:

**[Architecting for 100% Type Safety: A Guide for Developers & LLMs](../standards/coding-standards.md)**

This guide is the **single source of truth** for code quality and covers:

- Foundational TypeScript & ESLint rules.
- Runtime validation with Zod.
- **The Next.js & React Frontend Playbook**: Top 10 common infrastructure issues and their solutions.
- **Tool-Assisted Debugging**: How to use MCP tools like Context7 and web search to resolve issues.
- A visual map of the entire validation and development pipeline.

### Zod Schema Organization

**All Zod schemas MUST be placed in `/src/types/schemas/` directory**. This is enforced by ESLint rules. The pattern ensures:

- Centralized validation logic
- Consistent type generation
- Easy discovery and reuse
- Clear separation of concerns

Example schemas:

- `/src/types/schemas/url.ts` - URL validation with SSRF protection
- `/src/types/schemas/education.ts` - Education data validation
- `/src/types/schemas/experience.ts` - Experience data validation
- `/src/types/schemas/related-content.ts` - Related content debug param validation
- `/src/types/schemas/og-image.ts` - OG image entity types and per-entity param validation

---

## Verification Notes

- Bookmark refresh pipelines preserve embedded slugs during metadata-only updates to avoid URL churn (see `bookmarks.md`).
- Search indexes loaded from S3 hydrate with build-time MiniSearch options for consistent scoring (see `search.md`).
- Image streaming fallbacks re-fetch before buffering to respect single-use Response bodies (see `image-handling.md`).
- ESLint project-specific rules live under `config/eslint/rules/` and are wired from `eslint.config.ts`.
- Oxlint JS plugins live under `config/oxlint/js-plugins/` and are wired from `.oxlintrc.json` (experimental; not supported in the language server/editor integrations).
- S3 I/O is standardized under `lib/s3/*` with SDK retries only; CDN usage is explicit at call sites (see `s3-storage.md`).
- Bookmark reads no longer use local S3 cache fallbacks; all bookmark storage access is S3-only (see `bookmarks.md`).
- Books use an S3-first architecture: `lib/books/generate.ts` consolidates ABS data + manual enrichments + AI summaries into versioned S3 snapshots; the web app reads from S3 via `books-data-access.server.ts`, never calling ABS directly at request time. Books generation is automated via the scheduler (daily at 6 AM PT, `--books` flag) with cache invalidation through `/api/revalidate/books`.
- GitHub activity orchestration is split across dedicated data-access modules for repo stats, commit counts, CSV repair, and summary persistence (see `features/github-activity.md`).
- OpenGraph data access delegates Next.js cache and refresh workflows to focused modules (`opengraph-next-cache.ts`, `opengraph-refresh.ts`) with shared cache guards (`opengraph-cache-context.ts`) (see `features/opengraph.md`).
- Dynamic OG image generation uses a unified `/api/og/[entity]` route with per-entity layout renderers in `lib/og-image/layouts/`, SSRF-protected image fetching, and shared design tokens. All page `generateMetadata()` functions use `buildOgImageUrl()` from `lib/og-image/build-og-url.ts` (see `features/opengraph.md`).
- Route protections: `src/proxy.ts` applies sitewide rate limiting plus memory-pressure shedding for matched traffic, while `/api/ai/chat/[feature]` enforces its own `memoryPressureMiddleware(...)` check in `chat-helpers.ts` because that route bypasses the proxy matcher.
- Live Chroma integration tests are opt-in and gated by `CHROMA_*` env vars (see `chroma.md`).
- Test-only mock modules live under `__tests__/__mocks__/` and are enforced via linting (see `standards/testing.md`).
- Terminal AI chat queues are handled by `src/components/ui/terminal/use-ai-chat-queue.client.tsx` to serialize requests and cap client-side pending messages (see `features/terminal.md`).
- Image manifest warm-up is startup-critical in production: request-path logo lookups skip lazy S3 manifest fetches when warm-up fails to avoid cache-components prerender IO bailouts (see `image-handling.md`).
- AI chat gateway contracts are SSE-only end-to-end (`/api/ai/chat/[feature]` plus `aiChat()` browser client), with shared feature identifiers/queue-key builders and upstream delta forwarding centralized in `ai-shared-services` (see `architecture/ai-services.md`).
- AI upstream pipeline tests are split by responsibility (streaming, tools, analysis validation) and share a dedicated harness module for DRY fixture/mocking (`__tests__/api/ai/upstream-pipeline-test-harness.ts`).
- RAG inventory catalogs for terminal chat are assembled server-side from repo data and dynamic sources with explicit token-bound truncation (`src/lib/ai/rag/inventory-*.ts`).
- Sitemap generation is split into domain-specific collectors under `src/lib/sitemap/` (blog, bookmarks, books/thoughts, constants, date-utils) with `src/app/sitemap.ts` as a thin orchestrator owning only the runtime cache and static-page entries.
- Navigation-first throttle policy: rate limiter only blocks `document` and `api` classes; `rsc`/`prefetch`/`_next/image` are not independently throttled to prevent partial renders. Memory shedding is stricter: all request classes are rejected with 503 when memory is critical (`src/lib/utils/request-utils.ts`, `src/lib/middleware/sitewide-rate-limit.ts`, `src/lib/middleware/memory-pressure.ts`).
- Deterministic throttle/load-shed contracts: document requests return HTML `429/503`, API requests return standardized JSON `RATE_LIMITED|SERVICE_UNAVAILABLE` payloads with `Retry-After` + `Cache-Control: no-store` (`src/lib/utils/api-utils.ts`, `src/types/schemas/api.ts`).

## Core Architectural Patterns

### Isomorphic URL Resolution (`lib/get-base-url.ts`)

To ensure API calls work seamlessly on both the client and the server, the application uses a `getBaseUrl()` utility.

- **On the Client**: Returns an empty string (`''`), allowing `fetch` to use relative paths (e.g., `/api/bookmarks`), standard browser behavior.
- **On the Server**: Returns absolute URL (e.g., `https://williamcallahan.com`), necessary for server-side fetches. Reads from `NEXT_PUBLIC_SITE_URL`.

### Server/Client Boundary Management

Runtime guards enforce proper code execution contexts in Next.js (`lib/utils/runtime-guards.ts`):

- `assertServerOnly()`: Ensures code only runs on the server
- `assertClientOnly()`: Ensures code only runs in the browser
- `useIsClient()`: Hook to check if code is running on the client
- `safeClientOnly()`: Wrapper for browser-specific API calls

### Provider Localization

TerminalProvider is localized to the terminal subtree in `app/layout.tsx` for resilience. See "Provider Location & Resilience" in [terminal.md](../features/terminal.md).

## Functionality Map

| Functionality                  | Core Objective                                                                                                                                                           | Documentation                                           | Diagram                                      |
| :----------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------ | :------------------------------------------- |
| `accessibility`                | Provide reusable components and utilities to enhance accessibility and ensure WCAG compliance.                                                                           | [accessibility.md](../features/accessibility.md)        | [Diagram](../features/accessibility.mmd)     |
| `ai-shared-services`           | OpenAI SDK-backed AI gateway (`chat.completions` + `responses`) with queueing, tool calling, and per-feature upstream configuration.                                     | [ai-services.md](ai-services.md)                        |                                              |
| `next-js-16-usage`             | Governs all framework-level work for Next.js 16, React 19, and Vitest 4 (cache components, async params, outlawed patterns).                                             | [nextjs-framework.md](../standards/nextjs-framework.md) |                                              |
| `analytics`                    | Load and manage third-party tracking scripts (Plausible, Umami, Clicky) in a safe, non-blocking, and privacy-conscious manner.                                           | [analytics.md](../features/analytics.md)                |                                              |
| `app-layout`                   | Provide the root layout wrapper with global styles, providers, and a consistent UI structure for all pages.                                                              | [app-layout.md](app-layout.md)                          | [Diagram](app-layout.mmd)                    |
| `batch-fetch-update`           | Outline the automated background refresh schedule and batch processing architecture for production data.                                                                 | [batch-processing.md](batch-processing.md)              |                                              |
| `blog`                         | Encompass all components and utilities that manage the display, interaction, and data handling for blog content.                                                         | [blog.md](../features/blog.md)                          | [Diagram](../features/blog.mmd)              |
| `blog-article`                 | Provide all necessary components to render a single blog post page, including content, metadata, and interactive UI elements.                                            | [blog-article.md](../features/blog-article.md)          | [Diagram](../features/blog-article.mmd)      |
| `bookmarks`                    | Act as the primary orchestration layer for fetching, processing, enriching, and storing bookmark data from external APIs.                                                | [bookmarks.md](../features/bookmarks.md)                | [Diagram](../features/bookmarks.mmd)         |
| `caching`                      | Implement high-performance, multi-tiered caching with request coalescing, distributed locking, and memory-safe operations.                                               | [caching.md](caching.md)                                | [Diagram](caching.mmd)                       |
| `chroma`                       | Provide vector similarity search for semantic content discovery and related content.                                                                                     | [chroma.md](chroma.md)                                  |                                              |
| `code-block`                   | Provide interactive code display components with syntax highlighting, copy-to-clipboard features, and macOS-style window controls.                                       | [code-blocks.md](../features/code-blocks.md)            |                                              |
| `config`                       | Provide centralized configuration management for environment variables, build tools, linting, formatting, and framework settings.                                        | [coding-standards.md](../standards/coding-standards.md) | [Diagram](config.mmd)                        |
| `css`                          | Map the CSS architecture and styling system, which uses Tailwind CSS, custom component styles, and Prism.js for syntax highlighting.                                     | [styling.md](../standards/styling.md)                   | [Diagram](../standards/styling.mmd)          |
| `data-access`                  | Outline the data access layer, detailing how data retrieval and storage operations are managed.                                                                          | [data-access.md](data-access.md)                        |                                              |
| `education`                    | Display a comprehensive list of university degrees, recent courses, and professional certifications using a server-centric rendering approach.                           | [education.md](../features/education.md)                | [Diagram](../features/education.mmd)         |
| `experience`                   | Showcase professional work history and a categorized list of skills, pre-rendered on the server for performance.                                                         | [experience.md](../features/experience.md)              | [Diagram](../features/experience.mmd)        |
| `github-activity`              | Act as the high-level orchestration layer for fetching, processing, and storing comprehensive GitHub activity data.                                                      | [github-activity.md](../features/github-activity.md)    | [Diagram](../features/github-activity.mmd)   |
| `home`                         | Comprise the components responsible for rendering the main landing page (`/`).                                                                                           | [home.md](../features/home.md)                          |                                              |
| `hooks`                        | Provide essential React utilities for UI interactions, state management, and browser API integration with SSR safety.                                                    | [react-hooks.md](react-hooks.md)                        | [Diagram](react-hooks.mmd)                   |
| `image-handling`               | Provide a robust, centralized system for fetching, processing, and serving images with memory-safe operations.                                                           | [image-handling.md](image-handling.md)                  | [Diagram](image-handling.mmd)                |
| `instrumentation-monitoring`   | Provide a lightweight, server-only mechanism to register, time, and monitor long-running asynchronous operations.                                                        | [monitoring.md](../ops/monitoring.md)                   | [Diagram](../ops/monitoring.mmd)             |
| `interactive-containers`       | Comprise UI components that act as interactive wrappers for other content, managing visibility and layout (e.g., dropdowns).                                             | [interactive-ui.md](../features/interactive-ui.md)      |                                              |
| `investments`                  | Display a list of private company investments, pre-rendering content on the server for performance.                                                                      | [investments.md](../features/investments.md)            | [Diagram](../features/investments.mmd)       |
| `json-handling`                | Manage the fetching, processing, caching, and storage of various JSON-based data sets (bookmarks, GitHub activity, etc.).                                                | [json-data.md](json-data.md)                            | [Diagram](json-data.mmd)                     |
| `linting-formatting`           | **[CRITICAL]** The master guide for code quality, formatting, and **100% strict TypeScript type safety**.                                                                | [coding-standards.md](../standards/coding-standards.md) | [Diagram](../standards/coding-standards.mmd) |
| `log-error-debug-handling`     | Provide comprehensive logging, error handling, debugging, network resilience, and monitoring capabilities.                                                               | [observability.md](../ops/observability.md)             | [Diagram](../ops/observability.mmd)          |
| `macos-gui`                    | Encompass components that emulate the macOS graphical user interface style.                                                                                              | [macos-gui.md](../features/macos-gui.md)                | [Diagram](../features/macos-gui.mmd)         |
| `memory-mgmt`                  | Provide robust, multi-layered memory management to prevent leaks and ensure application stability under load.                                                            | [memory-management.md](memory-management.md)            | [Diagram](memory-management.mmd)             |
| `navigation`                   | Encompass components and utilities that manage user navigation, including responsive menus and anchor scrolling.                                                         | [navigation.md](../features/navigation.md)              |                                              |
| `opengraph`                    | Provide resilient OpenGraph metadata extraction and image processing for any URL, with comprehensive fallbacks and caching.                                              | [opengraph.md](../features/opengraph.md)                | [Diagram](../features/opengraph.mmd)         |
| `overview`                     | Provide a high-level architectural overview of the repository, focusing on core application structure and patterns.                                                      | [system-overview.md](system-overview.md)                | [Diagram](system-overview.mmd)               |
| `projects`                     | Display a filterable list of projects using a hybrid server-client approach for fast initial loads and interactive filtering.                                            | [projects.md](../features/projects.md)                  | [Diagram](../features/projects.mmd)          |
| `rate-limit-and-sanitize`      | Encompass utilities for API rate limiting, input/output sanitization, and Cloudflare origin guards for sensitive endpoints.                                              | [security-rate-limiting.md](security-rate-limiting.md)  | [Diagram](security-rate-limiting.mmd)        |
| `react-server-client`          | Provide comprehensive guidance for React 19 Server Components, Next.js 15 server/client boundaries, streaming patterns, and environment variable security.               | [react-patterns.md](../standards/react-patterns.md)     |                                              |
| `s3-object-storage`            | Provide centralized, S3-compatible object storage with layered abstraction and CDN optimization.                                                                         | [s3-storage.md](s3-storage.md)                          | [Diagram](s3-storage.mmd)                    |
| `search`                       | Provide site-wide and section-specific search capabilities with fuzzy matching, caching, and security features.                                                          | [search.md](../features/search.md)                      | [Diagram](../features/search.mmd)            |
| `seo`                          | Comprehensive SEO system with metadata generation, JSON-LD, sitemaps, and universal OpenGraph image API with idempotent persistence and X.com/Twitter fallback handling. | [seo.md](../features/seo.md)                            | [Diagram](../features/seo.mmd)               |
| `social-links`                 | Outline the architecture of the Social Contact feature, which displays social media profiles and links.                                                                  | [social-links.md](../features/social-links.md)          |                                              |
| `state-theme-window-providers` | Provide centralized provider composition for application-wide state, including theme, terminal, and window management.                                                   | [state-management.md](state-management.md)              | [Diagram](state-management.mmd)              |
| `string-manipulation`          | Contain generic utilities for formatting and converting strings (e.g., `kebabCase`).                                                                                     | [utils.md](utils.md)                                    |                                              |
| `terminal`                     | Encompass components and utilities that manage the display, interaction, and state of the application's terminal interface.                                              | [terminal.md](../features/terminal.md)                  | [Diagram](../features/terminal.mmd)          |
| `testing-config`               | Configure and set up the testing environment for Vitest, including mocks, jsdom setup, and type definitions.                                                             | [testing.md](../standards/testing.md)                   | [Diagram](../standards/testing.mmd)          |

### Provider Localization Note

- TerminalProvider is localized to the terminal subtree in `app/layout.tsx` for resilience. See "Provider Location & Resilience" in [terminal.md](../features/terminal.md) for details and guarantees.
