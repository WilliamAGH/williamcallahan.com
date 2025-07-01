# Project Architecture Entrypoint

This document serves as the master index for all architectural documentation in the repository. It provides a high-level overview of each defined "functionality," its core objective, and direct links to its detailed documentation and visual diagrams.

**Start here** to understand the structure and responsibilities of different parts of the application.

## 🚨 CRITICAL: TypeScript, Next.js & React Guidance

This project enforces **100% strict TypeScript type safety** and adherence to modern Next.js and React best practices. All code must pass `bun run validate` before any commit. This is non-negotiable.

For a comprehensive guide on how to diagnose and fix type errors, and for crucial framework guidance, see the master playbook:

**[➡️ Architecting for 100% Type Safety: A Guide for Developers & LLMs](./linting-formatting.md)**

This guide is the **single source of truth** for code quality and covers:

- Foundational TypeScript & ESLint rules.
- Runtime validation with Zod.
- **The Next.js & React Frontend Playbook**: Top 10 common infrastructure issues and their solutions.
- **Tool-Assisted Debugging**: How to use MCP tools like Context7 and web search to resolve issues.
- A visual map of the entire validation and development pipeline.

---

## Functionality Map

| Functionality | Core Objective | Documentation | Diagram |
|---------------|----------------|---------------|---------|
| `accessibility` | Provide reusable components and utilities to enhance accessibility and ensure WCAG compliance. | [accessibility.md](./accessibility.md) | [Diagram](./accessibility.mmd) |
| `ai-shared-services` | Unified AI provider integration (OpenAI, OpenRouter, Perplexity, Groq) and web search APIs with streaming, tool calling, and modern features. | [ai-shared-services.md](./ai-shared-services.md) | |
| `analytics` | Load and manage third-party tracking scripts (Plausible, Umami, Clicky) in a safe, non-blocking, and privacy-conscious manner. | [analytics.md](./analytics.md) | |
| `app-layout` | Provide the root layout wrapper with global styles, providers, and a consistent UI structure for all pages. | [app-layout.md](./app-layout.md) | [Diagram](./app-layout.mmd) |
| `batch-fetch-update` | Outline the automated background refresh schedule and batch processing architecture for production data. | [batch-fetch-update.md](./batch-fetch-update.md) | |
| `blog` | Encompass all components and utilities that manage the display, interaction, and data handling for blog content. | [blog.md](./blog.md) | [Diagram](./blog.mmd) |
| `blog-article` | Provide all necessary components to render a single blog post page, including content, metadata, and interactive UI elements. | [blog-article.md](./blog-article.md) | [Diagram](./blog-article.mmd) |
| `bookmarks` | Act as the primary orchestration layer for fetching, processing, enriching, and storing bookmark data from external APIs. | [bookmarks.md](./bookmarks.md) | [Diagram](./bookmarks.mmd) |
| `caching` | Implement high-performance, multi-tiered caching with request coalescing, distributed locking, and memory-safe operations. | [caching.md](./caching.md) | [Diagram](./caching.mmd) |
| `code-block` | Provide interactive code display components with syntax highlighting, copy-to-clipboard features, and macOS-style window controls. | [code-block.md](./code-block.md) | |
| `config` | Provide centralized configuration management for environment variables, build tools, linting, formatting, and framework settings. | [config.md](./config.md) | [Diagram](./config.mmd) |
| `css` | Map the CSS architecture and styling system, which uses Tailwind CSS, custom component styles, and Prism.js for syntax highlighting. | [css.md](./css.md) | [Diagram](./css.mmd) |
| `data-access` | Outline the data access layer, detailing how data retrieval and storage operations are managed. | [data-access.md](./data-access.md) | |
| `education` | Display a comprehensive list of university degrees, recent courses, and professional certifications using a server-centric rendering approach. | [education.md](./education.md) | [Diagram](./education.mmd) |
| `experience` | Showcase professional work history and a categorized list of skills, pre-rendered on the server for performance. | [experience.md](./experience.md) | [Diagram](./experience.mmd) |
| `github-activity` | Act as the high-level orchestration layer for fetching, processing, and storing comprehensive GitHub activity data. | [github-activity.md](./github-activity.md) | [Diagram](./github-activity.mmd) |
| `home` | Comprise the components responsible for rendering the main landing page (`/`). | [home.md](./home.md) | |
| `hooks` | Provide essential React utilities for UI interactions, state management, and browser API integration with SSR safety. | [hooks.md](./hooks.md) | [Diagram](./hooks.mmd) |
| `image-handling` | Provide a robust, centralized system for fetching, processing, and serving images with memory-safe operations. | [image-handling.md](./image-handling.md) | [Diagram](./image-handling.mmd) |
| `instrumentation-monitoring` | Provide a lightweight, server-only mechanism to register, time, and monitor long-running asynchronous operations. | [instrumentation-monitoring.md](./instrumentation-monitoring.md) | [Diagram](./instrumentation-monitoring.mmd) |
| `interactive-containers` | Comprise UI components that act as interactive wrappers for other content, managing visibility and layout (e.g., dropdowns). | [interactive-containers.md](./interactive-containers.md) | |
| `investments` | Display a list of private company investments, pre-rendering content on the server for performance. | [investments.md](./investments.md) | [Diagram](./investments.mmd) |
| `json-handling` | Manage the fetching, processing, caching, and storage of various JSON-based data sets (bookmarks, GitHub activity, etc.). | [json-handling.md](./json-handling.md) | [Diagram](./json-handling.mmd) |
| `linting-formatting` | **[CRITICAL]** The master guide for code quality, formatting, and **100% strict TypeScript type safety**. | [linting-formatting.md](./linting-formatting.md) | [Diagram](./linting-formatting.mmd) |
| `log-error-debug-handling` | Provide comprehensive logging, error handling, debugging, network resilience, and monitoring capabilities. | [log-error-debug-handling.md](./log-error-debug-handling.md) | [Diagram](./log-error-debug-handling.mmd) |
| `macos-gui` | Encompass components that emulate the macOS operating system's graphical user interface style. | [macos-gui.md](./macos-gui.md) | [Diagram](./macos-gui.mmd) |
| `memory-mgmt` | Provide robust, multi-layered memory management to prevent leaks and ensure application stability under load. | [memory-mgmt.md](./memory-mgmt.md) | [Diagram](./memory-mgmt.mmd) |
| `middleware` | Outline the security measures and middleware implementation, covering CSP, request handling, and security headers. | [middleware.md](./middleware.md) | |
| `navigation` | Encompass components and utilities that manage user navigation, including responsive menus and anchor scrolling. | [navigation.md](./navigation.md) | |
| `opengraph` | Provide resilient OpenGraph metadata extraction and image processing for any URL, with comprehensive fallbacks and caching. | [opengraph.md](./opengraph.md) | [Diagram](./opengraph.mmd) |
| `overview` | Provide a high-level architectural overview of the repository, focusing on core application structure and patterns. | [overview.md](./overview.md) | [Diagram](./overview.mmd) |
| `projects` | Display a filterable list of projects using a hybrid server-client approach for fast initial loads and interactive filtering. | [projects.md](./projects.md) | [Diagram](./projects.mmd) |
| `rate-limit-and-sanitize` | Encompass utilities for API rate limiting to prevent abuse and input/output sanitization for security. | [rate-limit-and-sanitize.md](./rate-limit-and-sanitize.md) | [Diagram](./rate-limit-and-sanitize.mmd) |
| `react-server-client` | Provide comprehensive guidance for React 19 Server Components, Next.js 15 server/client boundaries, streaming patterns, and environment variable security. | [react-server-client.md](./react-server-client.md) | |
| `s3-object-storage` | Provide centralized, S3-compatible object storage with layered abstraction and CDN optimization. | [s3-object-storage.md](./s3-object-storage.md) | [Diagram](./s3-object-storage.mmd) |
| `search` | Provide site-wide and section-specific search capabilities with fuzzy matching, caching, and security features. | [search.md](./search.md) | [Diagram](./search.mmd) |
| `seo` | Comprehensive SEO system with metadata generation, JSON-LD, sitemaps, and universal OpenGraph image API with idempotent persistence and X.com/Twitter fallback handling. | [seo.md](./seo.md) | [Diagram](./seo.mmd) |
| `social-links` | Outline the architecture of the Social Contact feature, which displays social media profiles and links. | [social-links.md](./social-links.md) | |
| `state-theme-window-providers` | Provide centralized provider composition for application-wide state, including theme, terminal, and window management. | [state-theme-window-providers.md](./state-theme-window-providers.md) | [Diagram](./state-theme-window-providers.mmd) |
| `string-manipulation` | Contain generic utilities for formatting and converting strings (e.g., `kebabCase`). | [string-manipulation.md](./string-manipulation.md) | |
| `terminal` | Encompass components and utilities that manage the display, interaction, and state of the application's terminal interface. | [terminal.md](./terminal.md) | [Diagram](./terminal.mmd) |
| `testing-config` | Configure and set up the testing environment for both Jest and Bun test runners, including mocks, polyfills, and type definitions. | [testing-config.md](./testing-config.md) | [Diagram](./testing-config.mmd) |
