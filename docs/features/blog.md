# Blog Architecture Map

## Overview

The "blog" functionality encompasses components and utilities that manage the display, interaction, and data handling for blog content within the application. This includes UI elements for blog listings, detailed views, and supplementary information displays.

## Key Files and Responsibilities

- **components/features/blog/blog-window.client.tsx**: Main UI component for the blog window, providing the primary interface for blog interactions.
- **components/features/blog/blog.client.tsx**: Core client-side component for blog features, handling blog content rendering.
- **components/features/blog/\***: Blog-related components are imported directly from concrete files (barrel removed).
- **components/features/blog-list/blog-card.tsx**: UI component for individual blog cards in a list view.
- **components/features/blog-list/blog-list.server.tsx**: Server-side component for pre-rendering the blog list.
- **components/features/blog-list/blog-list.tsx**: Client-side component for rendering a grid of blog entries.
- **components/features/blog/blog-list/\***: Blog list components are imported directly from concrete files (barrel removed).
- **components/features/shared/blog-author.tsx**: Displays author information including avatar, name, and bio.
- **components/features/shared/blog-tags.tsx**: Renders a list of tags associated with blog content.
- **components/features/blog/shared/\***: Shared blog components are imported directly from concrete files (barrel removed).
- **components/ui/background-info.client.tsx**: A client-side component that renders a collapsible box for supplementary background information, typically used in blog posts to highlight contextual details with mobile-friendly toggle functionality.
- **lib/blog.ts**: Retrieves and sorts posts from the canonical MDX source and memoizes slug lookups.
- **lib/blog/\***: Blog library modules are imported directly from concrete files (barrel removed).
- **lib/blog/mdx.ts**: Utilities for processing MDX content in blogs.
- **lib/blog/server-search.ts**: Server-side search functionality for blog content.
- **config/blog-render-canaries.ts**: Single owner of the two representative article
  render canaries used by browser and production verification.
- **src/types/schemas/blog-frontmatter.ts**: Zod single owner of MDX frontmatter and canonical blog slugs; runtime **lib/blog/validation.ts** and Node **scripts/seed-blog-posts.node.mjs** ingestion parse through it.
- **lib/blog/validation.ts**: Parses MDX frontmatter through the canonical schema and owns the cached canonical-slug-to-file-path index and route/cache lookup guard.
- **app/blog/page.tsx**: Blog index page with Incremental Static Regeneration (ISR) for optimized performance.

## Logic Flow and Interactions

- MDX files under **data/blog/posts/** are the sole blog authoring source. **lib/blog/validation.ts** parses their frontmatter through **src/types/schemas/blog-frontmatter.ts** and indexes canonical slugs independently of filenames; **lib/blog/mdx.ts** compiles the indexed documents, and **lib/blog.ts** owns public retrieval and memoization.
- The **app/blog/page.tsx** serves as the entry point, rendering the blog index using server-side components like **blog-list.server.tsx** for initial load performance.
- Client-side components such as **blog-window.client.tsx** and **blog.client.tsx** manage interactive elements and dynamic content loading.
- UI components like **blog-card.tsx**, **blog-author.tsx**, and **blog-tags.tsx** provide modular pieces for blog presentation.
- **background-info.client.tsx** enhances blog posts with collapsible supplementary information, using React hooks for state management and dynamic height calculations to determine if a toggle is needed on mobile devices.
- **config/blog-render-canaries.ts** owns the two end-to-end render scenarios.
  **e2e/blog-render.spec.ts** imports them for Chromium coverage, while
  **scripts/smoke-test-production.ts** imports the same catalog and delegates deployed
  HTML validation to **scripts/blog-render-smoke.ts**. Neither consumer owns a duplicate
  article list.

## Notes

- The blog functionality is designed for performance with server-side rendering and ISR, combined with client-side interactivity for a seamless user experience.
- Individual blog detail routes (`app/blog/[slug]/page.tsx`) provide `generateStaticParams()` from `getAllPostsMeta()` so slugs are prerendered during `next build`. `RelatedContent` uses the shared `related-content` cache tag inside its `<Suspense>` boundary, so prerendered recommendations stay stable during hydration and remain explicitly invalidatable.
- The blog detail page owns a server-rendered article shell; only interactive author, image, and MDX leaves cross client boundaries, preventing PPR hydration of the full streamed article subtree.
- Detail metadata and full-post lookups use route-scoped `use cache` functions. Route parameters bind to the canonical `isValidBlogSlug()` guard before entering those functions, preventing attacker-controlled invalid slugs from creating cache keys. The page renders its Suspense boundary before awaiting route params, so Docker's globally disabled optional cache wrapper cannot postpone the entire article shell.
- Build stability: both detail and tag routes include a safe placeholder static param fallback to satisfy Cache Components requirements when datasets are temporarily empty.
- Blog tag routes (`app/blog/tags/[tagSlug]/page.tsx`) now provide `generateStaticParams()` from `getAllTags()` and still render the “Discover More” related-content section sourced from the first post on the page, with the active tag excluded from recommendations.
- Components are modular, allowing reuse across different views, with special attention to accessibility and responsive design as seen in features like collapsible background info boxes.
- Required render verification is `bun run verify`; after deployment run
  `bun run deploy:smoke-test -- <base-url> [auth-token] [--expected-release-id=<id>]`
  and perform the focused browser dogfood procedure in `docs/ops/verification.md`.
