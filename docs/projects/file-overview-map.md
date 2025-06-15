# Repository Files Review Tracker

> **Functionality Column Guidance:**
> The `Functionality` column is crucial for keeping our documentation synchronized. Each value in this column should directly correspond to the base filename of an architecture document in `docs/projects/structure/` (e.g., a `Functionality` of `github-activity` maps to `docs/projects/structure/github-activity.md`). This creates a direct link between the code and its documentation.
>
> **Renaming and Stability:**
> You can and should rename the documentation files in `docs/projects/structure/` if their names no longer accurately reflect their content. When you do, be sure to update the corresponding `Functionality` values in this checklist to maintain the link. While we aim for stability, clarity is more important.

## Contents

- [Components Directory](#components-directory)
- [Lib Directory](#lib-directory)
- [Types Directory](#types-directory)
- [Config Directory](#config-directory)
- [Middleware Directory](#middleware-directory)
- [Root Directory](#root-directory)
- [App Directory](#app-directory)
- [Scripts Directory](#scripts-directory)
- [Styles Directory](#styles-directory)
- [Data Directory](#data-directory)
- [Public Directory](#public-directory)
- [Docs Directory](#docs-directory)
- [Tests Directory](#tests-directory)
- [Mocks Directory](#mocks-directory)

Legend: `[ ]` = untouched · `[~]` = located/initial note · `[x]` = fully mapped

File/Path                                       Functionality                   Description
-----------------                               ------------------------------  ---------------------------------------

## Components Directory

- [x] **analytics/**
  - [x] `analytics.client.tsx`                  `analytics`             - Client-side analytics tracking component
- [~] **features/**
  - [x] `index.ts`                              `components`            - Barrel file for all feature components
  - [x] **bookmarks/**
    - [x] `bookmark-card.client.tsx`            `bookmarks`             - Bookmark card UI
    - [x] `bookmarks-client-with-window.tsx`    `bookmarks`             - Bookmarks window entrypoint
    - [x] `bookmarks-window.client.tsx`         `bookmarks`             - UI for the bookmarks window
    - [x] `bookmarks-with-options.client.tsx`   `bookmarks`             - UI with additional bookmark options
    - [x] `bookmarks.{client,server}.tsx`       `bookmarks`             - Core bookmarks components
    - [x] `index.ts`                            `bookmarks`             - Barrel file for bookmark components
    - [x] `share-button.client.tsx`             `bookmarks`             - Share button for bookmarks
    - [x] `tags-list.client.tsx`                `bookmarks`             - UI for displaying bookmark tags
  - [x] **blog/**
    - [x] `blog-window.client.tsx`              `blog`                  - Main blog window UI
    - [x] `blog.client.tsx`                     `blog`                  - Main component for blog features
    - [x] `index.ts`                            `blog`                  - Blog components barrel file
    - [x] `standard-tweet-embed.client.tsx`     `blog-article`          - Standard tweet embedding component
    - [x] `tweet-embed.tsx`                     `blog-article`          - Embeds tweets using react-tweet and an image proxy
  - [x] **blog-article/**
    - [x] `blog-article.client.tsx`             `blog-article`          - Renders article content and metadata
    - [x] `blog-wrapper.tsx`                    `blog-article`          - Dynamic import wrapper for hydration
    - [x] `index.ts`                            `blog-article`          - Blog article components barrel file
    - [x] `mdx-content.tsx`                     `blog-article`          - MDX renderer with styled elements
    - [x] `software-schema.tsx`                 `terminal`              - Inserts SoftwareApplication schema.org metadata
    - [x] `mdx-table.server.tsx`                `blog-article`          - Styled table components for MDX
  - [x] **blog-list/**
    - [x] `blog-card.tsx`                       `blog`                  - Blog card UI
    - [x] `blog-list.server.tsx`                `blog`                  - Pre-renders the blog list
    - [x] `blog-list.tsx`                       `blog`                  - Client-side blog list grid
    - [x] `index.ts`                            `blog`                  - Blog list barrel file
  - [x] **shared/**
    - [x] `blog-author.tsx`                     `blog`                  - Author avatar, name & bio
    - [x] `blog-tags.tsx`                       `blog`                  - Tag list display
    - [x] `index.ts`                            `blog`                  - Blog shared components barrel file
  - [x] **education/**
    - [x] `certification-card.{client,server}.tsx` `education`          - list of education certifications cards
    - [x] `education-card.{client,server}.tsx`  `education`             - list of education/university cards
    - [x] `education.{client,server}.tsx`       `education`             - list/cards for education
  - [x] **experience/**
    - [x] `experience.client.tsx`               `experience`            - Experience window UI
    - [x] `index.ts`                            `experience`            - Experience barrel file
    - [x] `skills.tsx`                          `experience`            - Skills display component
  - [x] **github/**
    - [x] `cumulative-github-stats-cards.tsx`   `github-activity`       - Displays GitHub stats cards
    - [x] `github-activity.client.tsx`          `github-activity`       - Contribution calendar & stats dashboard
  - [x] **home/**
    - [x] `home.tsx`                            `home`                  - Main home page component
    - [x] `index.ts`                            `home`                  - Barrel file for home components
    - [x] `profile-image.tsx`                   `home`                  - Profile image display
  - [x] **investments/**
    - [x] `index.ts`                            `investments`           - Exports `Investments` (server component)
    - [x] `investment-card.{client,server}.tsx` `investments`           - ind card for each investment made
    - [x] `investments.{client,server}.tsx`     `investments`           - list investments
    - [x] `theme-wrapper.client.tsx`            `investments`           - theme wrapper for investments list
  - [x] **projects/**
    - [x] `index.ts`                            `projects`              - Projects barrel file
    - [x] `project-card.{client,server}.tsx`    `projects`              - ind project cards
    - [x] `project-tags.client.tsx`             `projects`              - Project tag filter UI
    - [x] `projects-list.{client,server}.tsx`   `projects`              - List all projects
    - [x] `projects-window.client.tsx`          `projects`              - Projects window wrapper
    - [x] `projects.client.tsx`                 `projects`              - Projects feature wrapper
  - [x] **social/**
    - [x] `contact.client.tsx`                  `social-links`          - Contact form
    - [x] `index.ts`                            `social-links`          - Social components barrel file
    - [x] `social-card-effects.client.tsx`      `social-links`          - Handles social card hover effects
    - [x] `social-card.client.tsx`              `social-links`          - Individual social link card
    - [x] `social-list.client.tsx`              `social-links`          - List of social links
    - [x] `social-window.client.tsx`            `social-links`          - Wrapper window for social links
- [x] **seo/**
  - [x] `json-ld.tsx`                           `seo`                   - JSON-LD structured data component
- [~] **ui/**
  - [x] **terminal/**
    - [x] `terminal-implementation.client.tsx`  `terminal`              - Terminal core UI implementation
    - [x] `terminal-header.tsx`                 `terminal`              - Header UI with window controls & title
    - [x] `terminal-context.client.tsx`         `terminal`              - Terminal state context
    - [x] `command-input.client.tsx`            `terminal`              - Terminal input UI
    - [x] `history.tsx`                         `terminal`              - Terminal history view
    - [x] `selection-view.client.tsx`           `terminal`              - Terminal selection view
    - [x] `use-terminal.client.ts`              `terminal`              - Terminal hook
  - [x] `accelerator-badge.tsx`                 `investments`           - Accelerator program badge
  - [x] `background-info.client.tsx`            `blog-article`          - Background info display component for posts
  - [x] `card.tsx`                              `interactive-containers` - Generic card component
  - [x] `collapse-dropdown.client.tsx`          `interactive-containers` - Collapsible dropdown component
  - [x] `error-boundary.client.tsx`             `log-error-debug-handling` - Error boundary to catch client-side errors
  - [x] `external-link.client.tsx`              `interactive-containers` - Styled external link
  - [x] `financial-metrics.server.tsx`          `investments`           - Renders financial metrics
  - [x] `focusTrap.client.tsx`                  `accessibility`         - Focus trapping utility
  - [x] `index.ts`                              ``                      - Barrel file for UI components
  - [x] `instruction-macos-frame-tabs.client.tsx` `macos-gui`           - macOS-style tabs for instructions
  - [x] `logo-image.client.tsx`                 `image-handling`        - Logo image component
  - [x] `macos-window.client.tsx`               `macos-gui`             - macOS-style window frame
  - [x] `responsive-table.client.tsx`           `investments`          - Responsive table component
  - [x] `shell-parent-tabs.client.tsx`          `terminal`              - Shell-like tabbed interface
  - [x] `simple-tabs.client.tsx`                `blog-article`          - Simple tab component
  - [x] `simple-tabs.css`                       `css`                   - CSS for simple tabs
  - [x] **social-icons/**
    - [x] `index.ts`                            `social-links`          - Barrel file for social icons
    - [x] `social-icon.tsx`                     `social-links`          - Individual social icon link
    - [x] `social-icons.client.tsx`             `social-links`          - Social icons list component
    - [x] `social-links.ts`                     `social-links`          - Data for social links
    - [x] `base-icon.tsx`                       `social-links`          - Base icon wrapper
    - [x] `x-icon.tsx`                          `social-links`          - X (Twitter) icon
    - [x] `discord-icon.tsx`                    `social-links`          - Discord icon
    - [x] `bluesky-icon.tsx`                    `social-links`          - Bluesky icon
    - [x] `linkedin-icon.tsx`                   `social-links`          - LinkedIn icon
    - [x] `github-icon.tsx`                     `social-links`          - GitHub icon
    - [x] `aventure-icon.tsx`                   `social-links`          - Aventure icon
    - [x] `individual-icon.tsx`                 `social-links`          - Individual investor icon
  - [x] **theme/**
    - [x] `theme-provider.client.tsx`           `theming`               - Theme provider using next-themes
    - [x] `theme-toggle.tsx`                    `theming`               - Button to toggle light/dark theme
  - [x] **code-block/**
    - [x] `code-block.client.tsx`               `code-block`            - Main code block component
    - [x] `copy-button.client.tsx`              `code-block`            - Copy button for code blocks
    - [x] `mdx-code-block-wrapper.client.tsx`   `code-block`            - MDX wrapper for code blocks
    - [x] `mdx-code-block.server.tsx`           `code-block`            - Renders MDX code blocks on the server
    - [x] **prism-syntax-highlighting/**
      - [x] `prism.css`                         `css`                   - Prism syntax highlighting theme
      - [x] `prism.js`                          `code-block`            - Prism syntax highlighting library
  - [ ] **experience-card/**
    - [x] `experience-card.{client,server}.tsx` `experience`            - Card for displaying a single work experience
    - [x] `index.ts`                            `experience`            - Barrel file for experience card
  - [x] **navigation/**
    - [x] `index.ts`                            `navigation`            - Barrel file for navigation components
    - [x] `navigation-link.client.tsx`          `navigation`            - Individual navigation link component
    - [x] `navigation-links.ts`                 `navigation`            - Navigation link definitions
    - [x] `navigation.client.tsx`               `navigation`            - Main navigation component
    - [x] `window-controls.tsx`                 `macos-gui`             - macOS-style window controls (close, minimize, maximize)

## Lib Directory

- [x] `async-job-queue.ts`                      `bookmarks`             - Asynchronous job queue implementation`                      - Asynchronous job queue implementation
- [x] `blog.ts`                                 `blog`                  - Blog data helper functions
- [x] `bookmarks.{client,server}.ts`            `json-handling`         - Helper functions for bookmarks
- [x] `bookmarks.ts`                            `json-handling`         - Core bookmarks logic
- [x] `cache.ts`                                `caching`               - Node-cache setup and utilities
- [x] `constants.ts`                            `overview`            - Project-wide constants
- [x] `data-access.ts`                          `data-access`           - Generic data access utilities
- [x] `education-data-processor.ts`             `education`             - Utilities for education logos and data
- [x] `errors.ts`                               `log-error-debug-handling` - Custom error classes
- [x] `getBaseUrl.ts`                           `shared-utils`                      - Base URL resolver
- [x] `imageAnalysis.ts`                        `image-handling`        - Image analysis utilities
- [x] `imageCompare.ts`                         `image-handling`        - Image comparison utilities
- [x] `logger.ts`                               `log-error-debug-handling` - Shared logger utility
- [x] `logo-fetcher.ts`                         `image-handling`        - Logo fetching utilities
- [x] `logo.server.ts`                          `image-handling`        - Server-side helper functions for logos
- [x] `logo.ts`                                 `image-handling`        - Core logo logic
- [x] `rate-limiter.ts`                         `rate-limit-and-sanitize`             - API rate limiting
- [x] `s3-utils.ts`                             `s3-object-storage`     - S3 utility functions
- [x] `s3.ts`                                   `s3-object-storage`     - S3 client setup
- [x] `search.ts`                               `search`                - Universal search utility
- [x] `server-cache.ts`                         `caching`               - Server-side in-memory cache
- [x] `utils.ts`                                `shared-utils`            - Shared utility helpers
- [ ] **blog/**
  - [x] `index.ts`                              `blog`                  - Barrel file for blog library functions
  - [x] `mdx.ts`                                `blog`                  - MDX processing utilities
  - [x] `server-search.ts`                      `blog`                  - Server-side blog search
  - [x] `validation.ts`                         `blog`                  - Blog data validation schemas
- [ ] **bookmarks/**
  - [x] `index.ts`                              `bookmarks`             - Barrel file for bookmark library functions
- [ ] **cache/**
  - [x] `index.ts`                              `caching`               - Barrel file for cache utilities
- [ ] **context/**
  - [x] `global-window-registry-context.client.tsx` `state-theme-window-providers` - Global context for window management
  - [x] `terminal-window-state-context.client.tsx` `terminal`            - Context for terminal window state
- [x] **data-access/**
  - [x] `bookmarks.ts`                          `json-handling`         - Data access for bookmarks
  - [x] `github.ts`                             `json-handling`         - Data access for GitHub
    - [x] `index.ts`                              ``                    - Barrel file for data access modules
  - [x] `investments.ts`                        `investments`           - Data access for investments
  - [x] `logos.ts`                              `image-handling`        - Data access for logos
  - [x] `opengraph.ts`                          `image-handling`        - Data access for OpenGraph data
  - [ ] **logos/**
    - [x] `config.ts`                           `image-handling`        - Configuration for logo processing
    - [x] `external-fetch.ts`                   `image-handling`        - External logo fetching logic
    - [x] `image-processing.ts`                 `image-handling`        - Logo image processing
    - [x] `s3-operations.ts`                    `s3-object-storage`     - S3 operations for logos
    - [x] `s3-store.ts`                         `s3-object-storage`     - S3 storage logic for logos
    - [x] `session.ts`                          `image-handling`        - Session management for logo operations
- [ ] **hooks/**
  - [x] `use-anchor-scroll.client.ts`           `navigation`            - Hook for scrolling to anchor links
  - [x] `use-fix-svg-transforms.ts`             `image-handling`        - Hook to fix SVG transform issues
  - [x] `use-isomorphic-layout-effect.ts`       `hooks`                 - Isomorphic layout effect hook
  - [x] `use-logo.ts`                           `image-handling`                 - Hook for using logos
  - [x] `use-window-size.client.ts`             `state-theme-window-providers` - Hook for tracking window size
  - [x] `use-window-state.client.ts`            `state-theme-window-providers` - Hook for managing window state
- [ ] **imageAnalysis/**
  - [x] `index.ts`                              `image-handling`        - Barrel file for image analysis
- [ ] **imageCompare/**
  - [x] `index.ts`                              `image-handling`        - Barrel file for image comparison
- [x] **s3-utils/**
  - [x] `index.ts`                              `s3-object-storage`     - Barrel file for S3 utilities
- [x] **seo/**
  - [x] `constants.ts`                          `seo`                   - SEO constants
  - [x] `index.ts`                              `seo`                   - Barrel export and core orchestration for SEO utilities
  - [x] `metadata.ts`                           `seo`                   - Metadata generation helpers
  - [x] `opengraph.ts`                          `seo`                   - OpenGraph metadata helpers
  - [x] `schema.ts`                             `seo`                   - Schema.org generation helpers
  - [x] `utils.ts`                              `seo`                   - SEO utility functions
- [x] **server-cache/**
  - [x] `index.ts`                              `caching`               - Barrel file for server cache
- [x] **test-utils/**
  - [x] `cache-tester.ts`                       `caching`               - Cache testing utility
- [x] **utils/**
  - [x] `api-sanitization.ts`                   `rate-limit-and-sanitize` - API input/output sanitization
  - [x] `debug.ts`                              `log-error-debug-handling` - Debugging utilities
  - [x] `domain-utils.ts`                       `bookmarks`             - Domain and URL utilities
  - [x] `ensure-server-only.ts`                 `overview`              - Ensures a module is only run on the server
  - [x] `formatters.ts`                         `string-manipulation`   - Data formatting functions
  - [x] `image-s3-utils.ts`                     `s3-object-storage`     - Image-specific S3 utilities
  - [x] `logger.ts`                             `log-error-debug-handling` - Shared logger utility
  - [x] `opengraph-utils.ts`                    `image-handling`        - OpenGraph utility functions
  - [x] `retry.ts`                              `log-error-debug-handling` - Retry logic for async operations
  - [x] `revalidate-path.ts`                    `caching`               - Next.js path revalidation helper
  - [x] `runtime-guards.ts`                     `overview`              - Runtime type guards
  - [x] `svg-transform-fix.ts`                  `image-handling`        - SVG transform fix utility
  - [x] `tag-utils.ts`                          `blog-article`          - Tag manipulation utilities
- [x] **validators/**
  - [x] `bookmarks.ts`                          `json-handling`         - Zod schemas for bookmark validation

## Types Directory

- [x] `accelerator.ts`                          `investments`           - Types for accelerator programs
- [x] `analytics.d.ts`                          `analytics`             - TypeScript definitions for analytics
- [x] `blog.ts`                                 `blog`                  - Types for blog posts and authors
- [x] `bookmark.ts`                             `bookmarks`             - Types for bookmarks
- [x] `component-types.ts`                      `interactive-containers` - Shared component prop types
- [x] `education.ts`                            `education`             - Types for education and certifications
- [x] `env.d.ts`                                `config`                - Environment variable type definitions
- [x] `error.ts`                                `log-error-debug-handling` - Types for custom errors
- [x] `eslint-custom-types.d.ts`                `linting-formatting`    - Custom types for ESLint configuration
- [x] `experience.ts`                           `experience`            - Types for professional experience
- [x] `investment.ts`                           `investments`           - Types for investments
- [x] `jest-dom.jest.d.ts`                      `testing-config`        - Jest DOM matcher type definitions
- [x] `jest-extended.d.ts`                      `testing-config`        - Jest extended matcher type definitions
- [x] `logo.ts`                                 `image-handling`        - Types for logos
- [x] `navigation.ts`                           `navigation`            - Types for navigation components
- [x] `node-cron.d.ts`                          `batch-fetch-update`    - Type definitions for node-cron
- [x] `project.ts`                              `projects`              - Types for projects
- [x] `s3.ts`                                   `s3-object-storage`     - Types for S3 operations
- [x] `search.ts`                               `search`                - Types for search functionality
- [x] `seo.ts`                                  `seo`                   - Types for SEO and metadata
- [x] `social.ts`                               `social-links`          - Types for social links
- [x] `terminal.ts`                             `terminal`              - Types for terminal components
- [ ] **global/**
  - [x] `bun-test-globals.d.ts`                 `testing-config`        - Global type definitions for Bun tests
  - [x] `matchers.d.ts`                         `testing-config`        - Custom matcher type definitions
  - [x] `window.d.ts`                           `state-theme-window-providers` - Augmentations for the global `Window` object
- [x] **seo/**
  - [x] `metadata.ts`                           `seo`                   - Types and Zod validation schemas for SEO metadata
  - [x] `opengraph.ts`                          `seo`                   - OpenGraph metadata helpers
  - [x] `schema.ts`                             `seo`                   - Types for Schema.org
  - [x] `shared.ts`                             `seo`                   - Shared SEO type definitions

## Config Directory

- [x] `.browserslistrc`                         `config`                - Browserslist configuration
- [x] `.remarkrc.mjs`                           `config`                - Remark (Markdown processor) configuration
- [x] `happydom.ts`                             `testing-config`        - Happy DOM (test environment) configuration
- [x] `tools.config.js`                         `config`                - Master configuration for multiple tools
- [x] **jest/**                                 `testing-config`        - Jest test framework configuration files
  - [x] `config.ts`                             `testing-config`        - Main Jest configuration
  - [x] `setup.ts`                              `testing-config`        - Jest setup with mocks and polyfills
  - [x] `core-setup.ts`                         `testing-config`        - Core Jest setup utilities
  - [x] `dom-setup.ts`                          `testing-config`        - DOM environment setup
  - [x] `polyfills.js`                          `testing-config`        - JavaScript polyfills for tests

## Middleware Directory

- [x] `cache-debug.ts`                          `caching`               - Middleware for debugging cache behavior

## Root Directory

- [x] `.cursorrules`                            `config`                - Cursor AI configuration
- [x] `.env-example`                            `config`                - Example environment variables
- [x] `.gitignore`                              `config`                - Git ignore file
- [x] `.hintrc`                                 `config`                - webhint configuration
- [x] `biome.json`                              `linting-formatting`    - Biome (linter/formatter) configuration
- [x] `bun.lock`                                `deps`                  - Bun lockfile
- [x] `components.json`                         `config`                - ShadCN UI component configuration
- [x] `Dockerfile`                              `deployment`            - Docker container configuration
- [x] `eslint.config.ts`                        `linting-formatting`    - ESLint configuration
  - [x] `instrumentation-client.ts`             `log-error-debug-handling` - Client-side instrumentation setup
- [x] `instrumentation.ts`                      `log-error-debug-handling` - Server-side instrumentation setup
- [x] `jest.config.ts`                          `testing-config`        - Jest configuration
- [x] `jest.polyfills.js`                       `testing-config`        - Polyfills for Jest environment
- [x] `jest.setup.ts`                           `testing-config`        - Jest setup file
- [x] `middleware.ts`                           `middleware`            - Next.js middleware
- [x] `next-env.d.ts`                           `config`                - Next.js environment type definitions
- [x] `next.config.ts`                          `config`                - Next.js configuration
- [x] `package.json`                            `deps`                  - Project dependencies and scripts
- [x] `README.md`                               `project-mgmt`          - Project README
- [x] `tailwind.config.js`                      `config`                - Tailwind CSS configuration (in root, not config/)
- [x] `tsconfig.json`                           `config`                - TypeScript configuration

## App Directory

- [x] `code-blocks.css`                         `css`                   - Styles for code blocks
- [x] `error.tsx`                               `log-error-debug-handling` - App-level error boundary
- [x] `favicon.ico`                             `image-handling`        - Favicon
- [x] `global-error.tsx`                        `log-error-debug-handling` - Global error boundary
- [x] `globals.css`                             `css`                   - Global stylesheets
- [x] `layout.tsx`                              `app-layout`            - Root layout & providers
- [x] `not-found.tsx`                           `log-error-debug-handling` - 404 Not Found page
  - [x] `page.tsx`                              `home`                  - Landing page & SEO
- [x] `providers.client.tsx`                    `state-theme-window-providers` - Client-side providers
- [x] `robots.ts`                               `seo`                   - `robots.txt` generator
- [x] `sitemap.ts`                              `seo`                   - `sitemap.xml` generator
- [~] **api/**
  - [x] **assets/`[assetId]`/`route.ts`**       `image-handling`        - API route for serving assets
  - [x] **bookmarks/**
    - [x] `route.ts`                            `bookmarks`             - Bookmarks API
    - [x] **refresh/`route.ts`**                `bookmarks`             - Refresh bookmarks API
  - [x] **cache/**
    - [x] **bookmarks/`route.ts`**              `bookmarks`             - Bookmarks cache API
    - [x] **clear/`route.ts`**                  `caching`               - Clear cache API
    - [x] **images/`route.ts`**                 `image-handling`        - Images cache API
  - [x] **debug/`posts`/`route.ts`**            `log-error-debug-handling` - Debug API for posts
  - [x] **github-activity/**
    - [x] `route.ts`                            `github-activity`       - GitHub activity API
    - [x] **refresh/`route.ts`**                `github-activity`       - Refresh GitHub activity API
  - [x] **health/`route.ts`**                   `log-error-debug-handling` - Health check API
  - [x] **ip/`route.ts`**                       `log-error-debug-handling` - IP address API
  - [x] **log-client-error/`route.ts`**         `log-error-debug-handling` - API endpoint for logging client-side errors
  - [ ] **logo/**
    - [x] `route.ts`                            `image-handling`        - Logo API
    - [x] **invert/`route.ts`**                 `image-handling`        - Invert logo API
  - [x] **og-image/`route.ts`**                 `image-handling`        - OpenGraph image API
  - [x] **posts/`route.ts`**                    `blog-article`          - Posts API
  - [x] **search/**
    - [x] **all/`route.ts`**                    `search`                - Global search API
    - [x] **blog/`route.ts`**                   `search`                - Blog search API
  - [x] **sentry-example-api/`route.ts`**       `log-error-debug-handling` - Sentry example API (debug endpoint)
  - [x] **tunnel/`route.ts`**                   `log-error-debug-handling` - Sentry tunnel API
  - [x] **twitter-image/[...path]/`route.ts`**  `blog-article`          - Twitter image proxy API
  - [x] **validate-logo/`route.ts`**            `image-handling`        - Validate logo API
- [x] **blog/**
  - [x] `page.tsx`                              `blog`                  - Blog index page (ISR)
  - [x] `[slug]/page.tsx`                       `blog`                  - Blog post page
  - [x] `tags/[tagSlug]/page.tsx`               `blog`                  - Blog tag page
- [x] **bookmarks/**
  - [x] `page.tsx`                              `bookmarks`             - Main page for the bookmarks section
  - [x] `loading.tsx`                           `bookmarks`             - Loading UI for the bookmarks section
  - [x] `error.tsx`                             `log-error-debug-handling` - Error UI for the bookmarks section
  - [x] `[slug]/page.tsx`                       `bookmarks`             - Individual bookmark detail page
  - [x] `domain/[domainSlug]/page.tsx`          `bookmarks`             - Legacy domain redirector page
  - [x] `tags/[tagSlug]/page.tsx`              `bookmarks`             - Bookmarks by tag page
- [x] **contact/**
  - [x] `page.tsx`                              `contact`               - Contact page (ISR)
- [x] **education/**
  - [x] `page.tsx`                              `education`             - Education page (ISR)
- [x] **experience/**
  - [x] `page.tsx`                              `experience`            - Experience page (ISR)
- [x] **investments/**
  - [x] `page.tsx`                              `investments`           - Investments page (ISR)
- [x] **projects/**
  - [x] `page.tsx`                              `projects`              - Projects page (ISR)
- [ ] **sentry-example-page/**
  - [x] `page.tsx`                              `log-error-debug-handling` - Sentry example page

## Scripts Directory

- [x] `bun-test-wrapper.sh`                     `testing-config`        - Wrapper for running Bun tests
- [x] `check-file-naming.ts`                    `testing-config`        - Script to check file naming conventions
- [x] `consolidate-configs.js`                  `build`                 - Script to consolidate configuration files
- [x] `debug-test-bookmark.ts`                  `log-error-debug-handling` - Debugging script for bookmarks
- [x] `entrypoint.sh`                           `deployment`            - Docker entrypoint script
- [x] `fix-fetch-mock.ts`                       `testing-config`        - Script to fix fetch mocks
- [x] `fix-test-imports.sh`                     `testing-config`        - Script to fix test imports
- [x] `force-refresh-repo-stats.ts`             `batch-fetch-update`    - Script to force-refresh GitHub repo stats
- [x] `populate-volumes.ts`                     `build`                 - Script to populate Docker volumes with data
- [x] `pre-build-checks.sh`                     `build`                 - Pre-build check script
- [x] `prefetch-data.ts`                        `batch-fetch-update`    - Script to prefetch data
- [x] `refresh-opengraph-images.ts`             `batch-fetch-update`    - Script to refresh OpenGraph images
- [x] `run-bun-tests.sh`                        `testing-config`        - Script to run Bun tests
- [x] `run-tests.sh`                            `testing-config`        - Script to run all tests
- [x] `scheduler.ts`                            `batch-fetch-update`    - Script to run scheduled tasks
- [x] `setup-test-alias.sh`                     `testing-config`        - Script to set up test aliases
- [x] `update-s3-data.ts`                       `batch-fetch-update`    - Script to update S3 data

## Styles Directory

- [x] `social-styles.css`                       `css`                   - Social media card hover effects
- [~] **globals/**
  - [ ] `*.css`                                 `css`                   - Global CSS files (directory does not exist)

## Data Directory

- [ ] **blog/**
  - [ ] **posts/**
    - [x] `*.mdx`                               `blog-article`          - Blog post content files
- [ ] `*.ts`                                    `data`                  - Data configuration files

## Public Directory

- [ ] **images/**
  - [x] `*`                                     `image-handling`        - Static image assets
- [ ] **fonts/**
  - [x] `*`                                     `image-handling`        - Font files
- [x] `*`                                       `image-handling`        - Other static assets

## Docs Directory

- [ ] **projects/**
  - [ ] **structure/**
    - [ ] `*.md`                                ``                      - Architecture documentation
  - [ ] `*.md`                                  ``                      - Project documentation
- [ ] `*.md`                                    ``                      - General documentation

## Tests Directory

- [x] **__tests__/**
  - [x] `README.md`                             `project-mgmt`          - Tests documentation
  - [x] **__mocks__/**
    - [x] `lib/node-cache.ts`                   `caching`               - Mock for node-cache library
    - [x] `lib/search.ts`                       `search`                - Mock for search functionality
    - [x] `node-fetch.js`                       `log-error-debug-handling` - Mock for node-fetch
    - [x] `sentry.js`                           `log-error-debug-handling` - Mock for Sentry error tracking
  - [x] **app/**
    - [x] **api/**
      - [x] **github-activity/**
        - [x] `cache.test.ts`                    `github-activity`       - Tests for GitHub activity caching
      - [x] **logo/**
        - [x] `cache.test.ts`                   `image-handling`        - Tests for logo caching
    - [x] `pages.smoke.test.ts`                 `app-layout`            - Smoke tests for all pages
  - [x] **blog/**
    - [x] `blog.smoke.test.ts`                  `blog`                  - Blog smoke tests
  - [x] `bookmarks.backend.connection.test.ts`  `bookmarks`             - Backend connection tests for bookmarks
  - [x] **components/**
    - [x] **analytics/**
      - [x] `Analytics.test.tsx`                 `analytics`             - Analytics component tests
    - [x] **features/**
      - [x] **investments/**
        - [x] `investment-card.test.tsx`         `investments`           - Investment card component tests
    - [x] **ui/**
      - [x] `code-block.test.tsx`                `code-block`            - Code block component tests
      - [x] `copy-button.test.tsx`               `code-block`            - Copy button component tests
      - [x] `logo-image.test.tsx`                `image-handling`        - Logo image component tests
      - [x] `theme-toggle.test.tsx`              `theming`               - Theme toggle component tests
      - [x] **navigation/**
        - [x] `navigation-link.test.tsx`         `navigation`            - Navigation link component tests
        - [x] `navigation.test.tsx`              `navigation`            - Navigation component tests
      - [x] **social-icons/**
        - [x] `aventure-icon.test.tsx`           `social-links`          - Aventure icon component tests
      - [x] **terminal/**
        - [x] `commands.test.ts`                 `terminal`              - Terminal commands tests
        - [x] `terminal.test.tsx`                `terminal`              - Terminal component tests
        - [x] `terminalSelectionView.test.tsx`   `terminal`              - Terminal selection view tests
  - [x] **lib/**
    - [x] `api-sanitization.test.ts`             `rate-limit-and-sanitize` - API sanitization tests
    - [x] `blog.test.ts`                         `blog`                  - Blog utility tests
    - [x] `bookmarks-s3-external-sync.unit.test.ts` `bookmarks`          - Bookmarks S3 sync unit tests
    - [x] `bookmarks-validation.test.ts`         `json-handling`         - Bookmarks validation tests
    - [x] `bookmarks.test.ts`                    `bookmarks`             - Bookmarks utility tests
    - [x] `cache.test.ts`                        `caching`               - Cache utility tests
    - [x] `data-access.s3.test.ts`               `s3-object-storage`     - S3 data access tests
    - [x] `imageAnalysis.test.ts`                `image-handling`        - Image analysis tests
    - [x] `imageCompare.test.ts`                 `image-handling`        - Image comparison tests
    - [x] `logo.test.ts`                         `image-handling`        - Logo utility tests
    - [x] `routes.test.ts`                       `navigation`            - Routes utility tests
    - [x] `s3-connection.test.ts`                `s3-object-storage`     - S3 connection tests
    - [x] `s3-utils-actual.test.ts`              `s3-object-storage`     - S3 utilities integration tests
    - [x] `search.test.ts`                       `search`                - Search utility tests
    - [x] `seo.test.ts`                          `seo`                   - SEO utility tests
    - [x] `server-cache-init.test.ts`            `caching`               - Server cache initialization tests
    - [x] `server-cache-simple.test.ts`          `caching`               - Server cache simple tests
    - [x] `utils.test.ts`                        `shared-utils`          - General utility tests
    - [x] **seo/**
      - [x] `metadata.test.ts`                   `seo`                   - SEO metadata tests
      - [x] `opengraph.test.ts`                  `seo`                   - OpenGraph metadata tests
      - [x] `utils.test.ts`                      `seo`                   - SEO utility tests
    - [x] **setup/**
      - [x] `server-only-mock.ts`                `overview`              - Mock for server-only modules
      - [x] `testing-library.ts`                 `testing-config`        - Testing library setup
    - [x] **utils/**
      - [x] `domain-utils.test.ts`               `bookmarks`             - Domain utility tests
      - [x] `svg-transform-fix.test.ts`          `image-handling`        - SVG transform fix tests
  - [x] **scripts/**
    - [x] `update-s3-data.smoke.test.ts`         `batch-fetch-update`    - S3 data update smoke tests
  - [x] **setup/**
    - [x] `bun-setup.ts`                         `testing-config`        - Bun test environment setup
  - [x] `tsconfig.jest.json`                     `testing-config`        - TypeScript config for Jest tests

## Mocks Directory

- [x] **__mocks__/**
  - [x] `fileMock.js`                            `testing-config`        - Mock for static file imports
  - [x] `styleMock.js`                           `testing-config`        - Mock for CSS/style imports
