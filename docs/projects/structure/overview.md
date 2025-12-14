# Project Architecture Overview

**Functionality:** `overview`

## Core Objective

This document provides a high-level architectural overview of the repository for <https://williamcallahan.com> (hosted at <https://github.com/WilliamAGH/williamcallahan.com>), focusing on core application structure and architectural patterns. For detailed information on specific topics, follow the cross-references to specialized documentation.

## 1. Core Application Architecture

The application follows a layered architecture with a clear separation of concerns, built around a central root layout. All source code is organized under the `src/` directory:

- `src/app/` - Next.js App Router pages and API routes
- `src/components/` - React components (features, UI, shared)
- `src/lib/` - Utility functions, services, and business logic
- `src/hooks/` - Custom React hooks
- `src/types/` - TypeScript types and Zod schemas
- `src/styles/` - Global CSS and Tailwind configuration

Root-level directories that remain outside `src/`:

- `config/` - Build and tool configuration files
- `data/` - Static data files and metadata
- `public/` - Static assets served by Next.js
- `scripts/` - Build and maintenance scripts
- `docs/` - Project documentation

### Root Layout

The application's root layout provides the foundation for all pages. See [`app-layout.md`](./app-layout.md) for detailed implementation.

### Homepage

The main landing page introduces William Callahan. See [`home.md`](./home.md) for the home feature architecture.

## 2. Next.js & Build Configuration

For detailed configuration documentation, see [`config.md`](./config.md).

### Build & Deployment

- **Development (`bun run dev`)**: Starts a local server with hot reloading.
- **Production (`bun run build`)**: Creates an optimized, standalone production bundle.
- **Deployment**: The application is containerized using Docker and is suitable for deployment on platforms like Vercel.
- **Scripts**: See `package.json` for the full suite of development, testing, linting, and build scripts.

## 3. Feature Breakdown

High-level overview of the main application features. For detailed maps, see the corresponding `[feature-name].md` files in this directory.

- **Blog**: Manages and displays blog content.
- **Bookmarks**: Handles personal bookmarks with a hybrid client/server architecture.
- **Projects**: Showcases personal projects with interactive filtering.
- **Social**: Displays social media links and a contact form.
- **Education & Experience**: Details professional and academic background.
- **GitHub Activity**: Displays GitHub contributions and statistics.

## 4. Component Architecture Patterns

The repository uses a standardized approach for component organization, leveraging "barrel files" to create clean, maintainable import/export APIs for different component modules.

### Shared UI Components (`src/components/ui/`)

The `src/components/ui/` directory contains foundational, reusable UI components that provide consistent styling and interaction patterns across the application (e.g., `Card`, `CollapseDropdown`). This directory uses a barrel file (`src/components/ui/index.ts`) to simplify imports.

- **Responsibility:** To collect and re-export all shared, reusable UI components.
- **Benefit:** Allows other parts of the application to import multiple UI components from a single, consistent path (e.g., `import { Card, Logo } from '@/components/ui'`) instead of referencing the full path to each component file.

### Feature Components (`src/components/features/`)

The `src/components/features/` directory contains high-level components that encapsulate major sections of the site (e.g., `Blog`, `Experience`, `Projects`). This directory also uses a barrel file (`src/components/features/index.ts`) as the main entry point for all major feature components.

- **Purpose**: Instead of importing features from their deep file paths (e.g., `@/components/features/blog/blog.client`), other modules can import them directly from `@/components/features`.
- **Benefit**: This simple pattern significantly cleans up import statements in the `src/app/` directory and other places where these high-level components are used.

### Implementation Note

Both barrel files (`ui/index.ts` and `features/index.ts`) are currently incomplete. A key improvement opportunity is to make these files comprehensive, ensuring they export all intended shared components to enforce consistent import patterns across the codebase.

This consolidated document serves as the primary reference for the overall project architecture. For deeper dives into specific features, refer to their individual documentation files.

## Core Architectural Patterns

### Isomorphic URL Resolution (`lib/get-base-url.ts`)

To ensure API calls work seamlessly on both the client and the server, the application uses a `getBaseUrl()` utility.

- **On the Client**: The function returns an empty string (`''`), allowing `fetch` to use relative paths (e.g., `/api/bookmarks`), which is the standard browser behavior.
- **On the Server**: The function returns an absolute URL (e.g., `https://williamcallahan.com`), which is necessary for the server to fetch from its own API endpoints during server-side rendering or build-time data fetching. It reads from the `NEXT_PUBLIC_SITE_URL` environment variable.

### Server/Client Boundary Management

The application uses runtime guards to enforce proper code execution contexts in Next.js:

- **`lib/utils/runtime-guards.ts`**: Provides functions to enforce server/client boundaries
  - `assertServerOnly()`: Ensures code only runs on the server
  - `assertClientOnly()`: Ensures code only runs in the browser
  - `useIsClient()`: Hook to check if code is running on the client
  - `safeClientOnly()`: Wrapper for browser-specific API calls
- **`lib/utils/ensure-server-only.ts`**: Module-level server-only enforcement

These utilities are crucial for preventing runtime errors and ensuring that browser-specific APIs are not called on the server, and vice versa.

### React Hooks Infrastructure

The application provides a comprehensive set of custom React hooks for common functionality. See [`hooks.md`](./hooks.md) for detailed documentation of all hooks including:

- Navigation and scrolling utilities
- SSR-safe layout effects
- Window state management
- SVG processing
- Data fetching patterns

### Debug-Only Logging

For debugging, logging, and error handling patterns, see [`log-error-debug-handling.md`](./log-error-debug-handling.md).

## Related Documentation

- **File Mapping**: See [`file-overview-map.md`](../file-overview-map.md) for a complete mapping of all files to their functionality
- **Testing**: See [`testing-config.md`](./testing-config.md) for testing strategy and configuration
- **Configuration**: See [`config.md`](./config.md) for all configuration files and settings
- **Linting & Formatting**: See [`linting-formatting.md`](./linting-formatting.md) for code quality tools and setup

This document provides a 30,000-foot view of the project's architecture. See the other files in this directory for deep dives into specific features.
