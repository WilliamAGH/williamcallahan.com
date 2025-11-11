# Blog Architecture Map

## Overview

The "blog" functionality encompasses components and utilities that manage the display, interaction, and data handling for blog content within the application. This includes UI elements for blog listings, detailed views, and supplementary information displays.

## Key Files and Responsibilities

- **components/features/blog/blog-window.client.tsx**: Main UI component for the blog window, providing the primary interface for blog interactions.
- **components/features/blog/blog.client.tsx**: Core client-side component for blog features, handling blog content rendering.
- **components/features/blog/index.ts**: Barrel file for exporting blog-related components.
- **components/features/blog-list/blog-card.tsx**: UI component for individual blog cards in a list view.
- **components/features/blog-list/blog-list.server.tsx**: Server-side component for pre-rendering the blog list.
- **components/features/blog-list/blog-list.tsx**: Client-side component for rendering a grid of blog entries.
- **components/features/blog-list/index.ts**: Barrel file for blog list components.
- **components/features/shared/blog-author.tsx**: Displays author information including avatar, name, and bio.
- **components/features/shared/blog-tags.tsx**: Renders a list of tags associated with blog content.
- **components/features/shared/index.ts**: Barrel file for shared blog components.
- **components/ui/background-info.client.tsx**: A client-side component that renders a collapsible box for supplementary background information, typically used in blog posts to highlight contextual details with mobile-friendly toggle functionality.
- **lib/blog.ts**: Helper functions for blog data management.
- **lib/blog/index.ts**: Barrel file for blog library functions.
- **lib/blog/mdx.ts**: Utilities for processing MDX content in blogs.
- **lib/blog/server-search.ts**: Server-side search functionality for blog content.
- **lib/blog/validation.ts**: Validation schemas for blog data.
- **app/blog/page.tsx**: Blog index page with Incremental Static Regeneration (ISR) for optimized performance.

## Logic Flow and Interactions

- Blog content starts with data processing in **lib/blog.ts** and related utilities, handling content retrieval and validation.
- The **app/blog/page.tsx** serves as the entry point, rendering the blog index using server-side components like **blog-list.server.tsx** for initial load performance.
- Client-side components such as **blog-window.client.tsx** and **blog.client.tsx** manage interactive elements and dynamic content loading.
- UI components like **blog-card.tsx**, **blog-author.tsx**, and **blog-tags.tsx** provide modular pieces for blog presentation.
- **background-info.client.tsx** enhances blog posts with collapsible supplementary information, using React hooks for state management and dynamic height calculations to determine if a toggle is needed on mobile devices.

## Notes

- The blog functionality is designed for performance with server-side rendering and ISR, combined with client-side interactivity for a seamless user experience.
- Individual blog detail routes (`app/blog/[slug]/page.tsx`) now keep the default Cache Components behavior and stream recommendations by wrapping `RelatedContent` in a `<Suspense>` boundary. The related content server component calls `connection()` internally so request-time S3 lookups wait for a user navigation without forcing `dynamic = "force-dynamic"`, keeping the rest of the page cachable.
- Components are modular, allowing reuse across different views, with special attention to accessibility and responsive design as seen in features like collapsible background info boxes.
