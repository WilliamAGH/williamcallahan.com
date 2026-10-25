# Projects Architecture

## Overview

The Projects feature displays a filterable list of projects. The cached page renders `ProjectsClient`, whose window imports the list from `projects-list.client.tsx`. Project cards appear in the initial server-rendered HTML; client code manages tag visibility and the window UI.

## Architecture Diagram

See [Projects Architecture Diagram](./projects.mmd).

## Core Components

### Rendering Components

- **`ProjectsClient` (`.../projects.client.tsx`)**: The main client-side entry point. It integrates the `ProjectsWindow` and `ProjectTagsClient`.
- **`ProjectsWindow` (`.../projects-window.client.tsx`)**: Manages the window state (normal, minimized, maximized) and renders the server-generated content within its frame.
- **`ProjectTagsClient` (`.../project-tags.client.tsx`)**: Renders the tag filters and handles the client-side logic for filtering the project list.

- **`ProjectsListServer` (`.../projects-list.client.tsx`)**: The exported alias for `ProjectsList`, imported by `ProjectsWindow`. It renders every project with its tag attributes; it is not a separate `.server.tsx` component.
- **`ProjectCard` (`.../project-card.client.tsx`)**: Renders each project's details and screenshot.

## Data & Rendering Flow

1. `app/projects/page.tsx` renders `ProjectsClient` inside its cached page.
2. `ProjectsClient` renders the tag controls and `ProjectsWindow`.
3. The window renders `ProjectsListServer` from `projects-list.client.tsx`, which reads `data/projects.ts` and renders every `ProjectCard` with `data-project-tags` attributes.
4. Initial SSR includes the project content; hydration enables the window controls.
5. `ProjectTagsClient` changes the selected tag in the URL; the window's `TagVisibilityController` shows or hides the matching cards.

## Resilience and Request Volume

- `src/app/projects/page.tsx` now treats CDN config/URL generation as optional for schema screenshots.
  - Missing or invalid CDN env/config no longer throws during render.
  - Schema generation falls back by omitting `screenshot` for impacted items.
- `src/components/features/projects/project-card.client.tsx` uses defensive CDN URL resolution.
  - Missing CDN config yields the existing placeholder path instead of throwing.
- Project detail links now set `prefetch={false}` in project cards.
  - This reduces high-volume prefetch fan-out from the projects grid under load.
  - Route transitions remain fully functional, but background request pressure is lower.
- Project detail URLs emit name-derived canonical slugs.
  - Older id-derived project paths resolve server-side and permanently redirect to the canonical slug.

## Key Files

- **UI Components**: `components/features/projects/`
- **Data Source**: `data/projects.ts`
- **Types**: `types/project.ts` (includes optional `cvFeatured` flag for the `/cv` curriculum vitae page)

## Notable Projects

- **ComposerAI**: Svelte + Vite email client with Spring Boot/Qdrant/S3 services in `data/projects.ts`, screenshot at `images/other/projects/composerai-app.png`. Live at `https://composer.email`.
- **CV Integration**: `cvFeatured` flags in `data/projects.ts` allow `/cv` to reuse the curated project list without duplicating data.
